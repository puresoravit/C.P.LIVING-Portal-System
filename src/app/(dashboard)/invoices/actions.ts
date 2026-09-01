"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { releaseInvoiceNumbersOnCancel } from "@/lib/invoice-sheets";

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
    include: {
      billingNote: true,
      taxInvoices: { where: { status: { not: "CANCELLED" } }, select: { id: true, taxInvoiceNumber: true } },
    },
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

  // Owner UAT (2026-08-31) — Smoke Test หลัง Deploy เจอว่า cancelOrder เช็คทั้ง BillingNote
  // และ TaxInvoice Active ก่อน Cascade อยู่แล้ว แต่ cancelInvoice เดี่ยวๆ นี้เช็คแค่
  // BillingNote — เพิ่ม Guard เดียวกันให้ตรงกัน (เดิมตั้งใจให้ TaxInvoice Active แค่กันการ
  // Reclaim เฉยๆ ไม่ได้กันการยกเลิก แต่จริงๆ ควรกันการยกเลิกทั้งก้อนเหมือน BillingNote
  // เพราะปล่อยให้ยกเลิก Invoice ที่มีใบกำกับภาษี Active อ้างอิงอยู่ จะเหลือใบกำกับภาษีที่
  // ยังไม่ยกเลิกไปอ้างอิง Invoice ต้นทางที่ถูกยกเลิกแล้ว)
  if (invoice.taxInvoices.length > 0) {
    const numbers = invoice.taxInvoices.map((tx) => tx.taxInvoiceNumber).join(", ");
    return {
      success: false,
      error: `Invoice นี้ถูกอ้างโดยใบกำกับภาษี ${numbers} แล้ว ต้องยกเลิกใบกำกับภาษีนั้นก่อนถึงจะยกเลิก Invoice ใบนี้ได้`,
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

      // Owner UAT (2026-08-31) — เข้าเงื่อนไข Reclaim ก็ต่อเมื่อไม่เคย PRINTED — Downstream
      // (BillingNote/TaxInvoice Active) ถูกกันไว้แล้วทั้งคู่ตั้งแต่ Guard ด้านบนก่อนจะมาถึง
      // จุดนี้ได้เลย (เหมือน cancelOrder ที่เช็ค Lock ก่อน Cascade ครั้งเดียว ไม่ต้องเช็คซ้ำ
      // ในนี้อีก)
      // Owner Approve (2026-09-02) — Physical Sheet: ปล่อยทุกเลขที่ใบนี้ถือ (แผ่นท้ายก่อน
      // ปิดท้ายเลขใบหลัก) ตามเงื่อนไขเดิม — มีแผ่นไหน PRINTED = ไม่ปล่อยอะไรเลยทั้งชุด
      // (ดู releaseInvoiceNumbersOnCancel ใน src/lib/invoice-sheets.ts)
      await releaseInvoiceNumbersOnCancel(tx, {
        id: invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        productTypeCode: invoice.productTypeCode,
        printedAt: invoice.printedAt,
      });

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
  // Owner Approve (2026-09-02) — Physical Sheet: PRINTED Checkpoint เป็น "ระดับแผ่น"
  // (กระดาษคนละใบพิมพ์คนละเวลาได้) — Flow พิมพ์ทั้งชุด (ไม่ส่ง sheetId) = มาร์คทุกแผ่น
  // ที่ยังไม่พิมพ์พร้อมกัน / Flow พิมพ์แผ่นเดียว (?sheet=) ส่ง sheetId มา = มาร์คเฉพาะ
  // แผ่นนั้น — ใบหลักเปลี่ยนเป็น PRINTED เมื่อครบทุกแผ่น Active เท่านั้น (Sales SOT เดิม
  // "นับเมื่อ PRINTED" = พิมพ์จริงครบชุด ไม่ Double-count) — ใบเก่าไม่มีแผ่น = พฤติกรรม
  // เดิมทุกประการ (มาร์คใบหลักตรงๆ)
  const scopeSheetId = String(formData.get("sheetId") || "") || null;

  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { sheets: { where: { voidedAt: null, numberReleased: false } } },
  });
  if (invoice.status === "CANCELLED") throw new Error("Invoice นี้ถูกยกเลิกแล้ว พิมพ์ไม่ได้");
  if (invoice.status === "CONFIRMED" && printProfile === "continuous") {
    const printedAt = new Date();
    if (invoice.sheets.length === 0) {
      // ใบเก่าก่อน Physical Sheet — Flow เดิมทุกประการ
      // Stabilization — Concurrency Hardening (Pattern เดียวกับ confirmOrder): CAS ด้วย
      // WHERE status='CONFIRMED' ให้ Transition CONFIRMED→PRINTED เกิดได้ครั้งเดียวเป๊ะ —
      // กัน Request ซ้อน (Double-click) เขียนทับ printedAt/printedById + Audit ซ้ำ
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
    } else {
      const targets = invoice.sheets.filter((s) => s.printedAt == null && (!scopeSheetId || s.id === scopeSheetId));
      await db.$transaction(async (tx) => {
        const marked: string[] = [];
        for (const sheet of targets) {
          // CAS ต่อแผ่น (printedAt ยังว่าง) — Write-once เหมือน printedAt ของใบหลักเดิม
          const cas = await tx.invoiceSheet.updateMany({
            where: { id: sheet.id, printedAt: null },
            data: { printedAt, printedById: user.id },
          });
          if (cas.count === 1) marked.push(sheet.sheetNumber);
        }
        if (marked.length > 0) {
          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "UPDATE",
              module: "Invoice",
              recordId: invoiceId,
              newValue: { printedSheets: marked, printedAt: printedAt.toISOString(), printProfile },
            },
          });
        }
        // ใบหลัก → PRINTED เมื่อครบทุกแผ่น Active (เช็คจากสถานะจริงใน tx หลังมาร์ค)
        const remaining = await tx.invoiceSheet.count({
          where: { invoiceId, voidedAt: null, numberReleased: false, printedAt: null },
        });
        if (remaining === 0) {
          const cas = await tx.invoice.updateMany({
            where: { id: invoiceId, status: "CONFIRMED" },
            data: { status: "PRINTED", printedAt, printedById: user.id },
          });
          if (cas.count === 1) await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "UPDATE",
              module: "Invoice",
              recordId: invoiceId,
              oldValue: { status: "CONFIRMED" },
              newValue: { status: "PRINTED", printedAt: printedAt.toISOString(), printProfile, note: "พิมพ์ครบทุกแผ่นแล้ว" },
            },
          });
        }
      });
    }
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

/** Owner Approve (2026-09-02) — พิมพ์เฉพาะแผ่น (?sheet=N): Bind sheetId เข้า FormData แล้ว
 * ใช้กติกาเดียวกับ markInvoicePrinted ทุกประการ */
export async function markInvoiceSheetPrinted(invoiceId: string, sheetId: string, formData: FormData) {
  formData.set("sheetId", sheetId);
  await markInvoicePrinted(invoiceId, formData);
}
