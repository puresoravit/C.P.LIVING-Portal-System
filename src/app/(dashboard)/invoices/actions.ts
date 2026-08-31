"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { parseDocNumber, tryReleaseSeq } from "@/lib/running-number-reclaim";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// ข้อ 28-29: Cancel เปลี่ยนแค่ status ห้าม Hard Delete — ประวัติต้องค้นหา/ตรวจสอบได้เสมอ
// Clarification: Billing Staff ยกเลิกเองได้เลย ไม่ต้องขอ Approve จาก Supervisor
export async function cancelInvoice(invoiceId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "invoice.cancel")) throw new Error("FORBIDDEN");

  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { billingNote: true },
  });
  // Phase E1 — Validation Error ที่คาดไว้แล้ว (ผู้ใช้ควรเห็นเหตุผลจริง) ให้ return
  // แทนการ throw เพราะ Next.js production build redact ข้อความของ Error ที่ throw
  // ออกจาก Server Action เหลือแค่ข้อความทั่วไป ทำให้ผู้ใช้เห็นแต่ "เกิดข้อผิดพลาด
  // บางอย่าง" ไม่รู้สาเหตุจริง (root cause ของปัญหา Cancel ที่ "บางครั้ง Error" —
  // ดู src/lib/action-result.ts) — Business Logic/เงื่อนไขการ block เดิมทุกอย่าง
  // ไม่เปลี่ยนแปลง เปลี่ยนแค่วิธีส่งข้อความกลับ
  if (invoice.status === "CANCELLED") return { success: false, error: "Invoice นี้ถูกยกเลิกไปแล้ว" };

  // กันไม่ให้ Invoice ที่อยู่ในใบวางบิลแล้วถูกยกเลิกลอยๆ — ต้องยกเลิกใบวางบิล
  // ก่อน (ซึ่งจะปลด billingNoteId ของ Invoice ทุกใบในนั้นให้เองอัตโนมัติ)
  // ไม่ Cascade อัตโนมัติจากตรงนี้ — ตรงกับหลักการเดียวกับ cancelOrder ที่
  // block เมื่อมี Invoice ที่ยังไม่ Cancel แทนการ cascade เอง
  if (invoice.billingNoteId) {
    return {
      success: false,
      error: `Invoice นี้อยู่ในใบวางบิล ${invoice.billingNote?.billingNoteNumber ?? ""} แล้ว ต้องยกเลิกใบวางบิลนั้นก่อนถึงจะยกเลิก Invoice ใบนี้ได้`,
    };
  }

  const beforeStatus = invoice.status;
  const CHANGED = "INVOICE_STATUS_CHANGED";
  try {
    await db.$transaction(async (tx) => {
      // Final Audit — CAS แบบเดียวกับ C1/C2 (Stabilization): เงื่อนไขทั้งหมดข้างบนตัดสิน
      // จากสถานะที่ "อ่านมาก่อนหน้า" — ถ้ามี Action อื่นเปลี่ยนสถานะแทรกกลาง (เช่น มาร์ค
      // PRINTED พร้อมกัน) การ update ตรงๆ จะเขียนทับโดยไม่รู้ตัว → เขียนแบบมีเงื่อนไข
      // status ต้องยังเท่าเดิม ไม่เท่า = มีคนเปลี่ยนไปแล้ว แจ้งให้รีเฟรชแทน
      const cas = await tx.invoice.updateMany({
        where: { id: invoiceId, status: beforeStatus },
        data: { status: "CANCELLED" },
      });
      if (cas.count === 0) throw new Error(CHANGED);

      // Owner UAT (2026-08-31) — เข้าเงื่อนไข Reclaim ก็ต่อเมื่อไม่เคย PRINTED และไม่มี
      // ใบกำกับภาษี Active อ้างอิงอยู่ (billingNoteId ถูกกันไว้แล้วตั้งแต่ Guard ด้านบน —
      // แต่ TaxInvoice ยังไม่เคยถูกเช็คใน cancelInvoice เดี่ยวๆ นี้มาก่อน เพิ่มเช็คตรงนี้
      // เฉพาะสำหรับเงื่อนไข Reclaim ไม่กระทบกฎการยกเลิก Invoice เดิมที่มีอยู่)
      if (!invoice.printedAt) {
        const activeTaxInvoice = await tx.taxInvoice.findFirst({
          where: { referenceInvoiceId: invoiceId, status: { not: "CANCELLED" } },
          select: { id: true },
        });
        if (!activeTaxInvoice) {
          const parsed = parseDocNumber(`INV-${invoice.productTypeCode}`, invoice.invoiceNumber);
          if (parsed) {
            const released = await tryReleaseSeq(`INV-${invoice.productTypeCode}`, parsed.period, parsed.seq, tx);
            if (released) {
              await tx.invoice.updateMany({ where: { id: invoiceId }, data: { numberReleased: true } });
            }
          }
        }
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CANCEL",
          module: "Invoice",
          recordId: invoiceId,
          oldValue: { status: beforeStatus },
          newValue: { status: "CANCELLED" },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === CHANGED) {
      return { success: false, error: "สถานะ Invoice เปลี่ยนไปแล้วระหว่างดำเนินการ — กรุณารีเฟรชหน้าแล้วลองใหม่" };
    }
    throw err;
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath(`/orders/${invoice.parentOrderId}`);
  return { success: true };
}

// R6 Phase D — Sales SOT: PRINTED ต้องแปลว่า "ยืนยันพิมพ์กระดาษต่อเนื่อง 9×11 จริงแล้ว"
// เท่านั้น — printProfile มาจาก Hidden Field ที่ PrintButton (Client) ส่งมาตาม Print
// Profile ที่เลือกอยู่จริงตอนกด (UI ซ่อนปุ่มนี้อยู่แล้วถ้าไม่ใช่ 9×11 — เช็คซ้ำฝั่ง Server
// เป็น Defense-in-depth เท่านั้น ไม่ใช่ Flow หลัก) printedAt/printedById เขียนครั้งเดียว
// ตอน CONFIRMED→PRINTED เท่านั้น (Reprint กดซ้ำ = No-op เพราะเงื่อนไข status ไม่ตรงอีกแล้ว
// จึงไม่มีทาง Overwrite First-Printed Timestamp เดิมโดยไม่ตั้งใจ)
export async function markInvoicePrinted(invoiceId: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "invoice.print")) throw new Error("FORBIDDEN");

  const printProfile = String(formData.get("printProfile") || "");

  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.status === "CANCELLED") throw new Error("Invoice นี้ถูกยกเลิกแล้ว พิมพ์ไม่ได้");
  if (invoice.status === "CONFIRMED" && printProfile === "continuous") {
    const printedAt = new Date();
    // Stabilization — Concurrency Hardening (Pattern เดียวกับ confirmOrder): CAS ด้วย
    // WHERE status='CONFIRMED' ให้ Transition CONFIRMED→PRINTED เกิดได้ครั้งเดียวเป๊ะ —
    // กัน Request ซ้อน (Double-click "มาร์คว่าพิมพ์แล้ว") เขียนทับ printedAt/printedById
    // ของครั้งแรก + Audit Log ซ้ำ 2 แถว — ถ้าแพ้ CAS (count=0) = มีคน Mark ไปก่อนแล้ว
    // ออกเงียบๆ เหมือนกรณี status≠CONFIRMED เดิม (ไม่ Throw เพราะผลลัพธ์ปลายทางถูกต้อง
    // อยู่แล้ว คือใบนี้เป็น PRINTED) — Sales SOT ไม่เคย Double-count อยู่แล้ว (นับจาก
    // status ไม่ใช่จำนวนครั้งที่ Mark) จุดนี้ปกป้อง printedAt/printedBy + Audit เท่านั้น
    const cas = await db.invoice.updateMany({
      where: { id: invoiceId, status: "CONFIRMED" },
      data: { status: "PRINTED", printedAt, printedById: user.id },
    });
    if (cas.count === 1) await db.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        module: "Invoice",
        recordId: invoiceId,
        oldValue: { status: "CONFIRMED" },
        newValue: { status: "PRINTED", printedAt: printedAt.toISOString(), printProfile },
      },
    });
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}
