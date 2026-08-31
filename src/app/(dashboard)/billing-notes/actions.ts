"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod, releaseSeqIfLatest } from "@/lib/running-number";
import { roundMoney } from "@/lib/pricing";
import { resolveBillingNoteDiscounts, type BillingNoteDiscountLine } from "@/lib/billing-note-discount";
import { partitionInvoicesForBilling, singleBillingGroup } from "@/lib/billing-note-split";
import { Decimal } from "@prisma/client/runtime/library";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// เลือก Invoice ที่ยังไม่เคยถูกวางบิล (billingNoteId = null) ของลูกค้ารายเดียว
// Smoke Test (2026-08-25) — applyDiscount: ติ๊ก "ใช้ส่วนลด" ตอนเลือกใบ → หักส่วนลดกลุ่ม
// ณ วันวางบิล เฉพาะใบที่ออกราคาเต็ม (ไม่หักซ้ำ — ดู resolveBillingNoteDiscounts) แล้วเก็บ
// Snapshot ต่อใบไว้ใน discountDetail — totalAmount กลายเป็นยอดสุทธิที่เรียกเก็บจริง
// Smoke Test R7 (2026-08-25) — Auto-split ตามกลุ่มส่วนลด (Owner ยืนยัน "แยกคนละใบ BI"):
// Invoice ที่เลือกถูกแบ่งเป็นใบวางบิลคนละเลขที่ต่อกลุ่มส่วนลดเสมอ (ไม่ผสมมั่ว — Semantic
// เดียวกับที่ Invoice แยกใบตามกลุ่มตอน Confirm Order) ภายในกลุ่มเรียงตามวัน→เลขที่ แล้ว
// พาไปหน้าพิมพ์ต่อเนื่องทีละใบทันที (Print Queue เดิม) — ลูกค้าที่มีกลุ่มเดียว/ไม่มีกลุ่ม
// ได้ใบเดียวเหมือนเดิมทุกประการ
export async function createBillingNote(
  customerId: string,
  invoiceIds: string[],
  billingNoteDate: string,
  applyDiscount = false,
  returnTo?: string,
  // R11 — ข้อ 7: true (Default) = แยกใบต่อกลุ่มส่วนลดแบบเดิม / false = รวมใบเดียว
  // เรียงตามวันที่/เลขที่ Invoice (ตัวเลือกอื่นๆ ลูกค้า/ช่วงวันที่/ส่วนลด เหมือนเดิมทุกอย่าง)
  splitByGroup = true
) {
  const user = await requireUser();
  if (!can(user.role, "billingNote.create")) throw new Error("FORBIDDEN");

  if (invoiceIds.length === 0) throw new Error("กรุณาเลือก Invoice อย่างน้อย 1 ใบ");

  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const invoices = await db.invoice.findMany({
    where: { id: { in: invoiceIds }, customerId, billingNoteId: null, status: { not: "CANCELLED" } },
  });

  if (invoices.length !== invoiceIds.length) {
    throw new Error(
      "มี Invoice บางใบที่เลือกไว้ถูกวางบิลไปแล้ว หรือถูกยกเลิกไปแล้ว — กรุณารีเฟรชหน้าแล้วเลือกใหม่"
    );
  }

  const date = new Date(billingNoteDate);
  const period = currentPeriod(date);
  const groups = splitByGroup ? partitionInvoicesForBilling(invoices) : singleBillingGroup(invoices);

  // คำนวณส่วนลดต่อกลุ่มนอก Transaction (Read-only ทั้งหมด) — ผูกผลลัพธ์กับชุด Invoice
  // ของกลุ่มนั้นตรงๆ ก่อนเข้าเขียนจริง
  const groupPayloads: {
    invoiceIds: string[];
    totalAmount: Decimal;
    discountDetail: BillingNoteDiscountLine[] | undefined;
  }[] = [];
  for (const groupInvoices of groups) {
    const grossTotal = roundMoney(groupInvoices.reduce((s, inv) => s.add(inv.grandTotal), new Decimal(0)));
    const discountResolution = applyDiscount
      ? await resolveBillingNoteDiscounts({
          customerId,
          billingNoteDate: date,
          invoices: groupInvoices.map((inv) => ({
            id: inv.id,
            branchId: inv.branchId,
            productTypeCode: inv.productTypeCode,
            grandTotal: inv.grandTotal,
            discountAmount: inv.discountAmount,
          })),
        })
      : null;
    groupPayloads.push({
      invoiceIds: groupInvoices.map((inv) => inv.id),
      totalAmount: discountResolution ? roundMoney(grossTotal.sub(discountResolution.discountTotal)) : grossTotal,
      discountDetail: discountResolution ? discountResolution.lines : undefined,
    });
  }

  const createdIds = await db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const payload of groupPayloads) {
      const seq = await getNextSeq("BI", period, tx);
      const billingNoteNumber = formatDocNumber("BI", period, seq, 3);

      const created = await tx.billingNote.create({
        data: {
          billingNoteNumber,
          billingNoteDate: date,
          customerId,
          customerNameSnapshot: customer.companyName,
          taxIdSnapshot: customer.taxId,
          addressSnapshot: null,
          creditTermSnapshot: customer.creditTerm,
          applyDiscount,
          discountDetail: payload.discountDetail,
          totalAmount: payload.totalAmount,
          status: "CONFIRMED",
          createdById: user.id,
        },
      });

      // Stabilization — Concurrency Hardening: เดิมเช็ค "billingNoteId IS NULL" นอก Transaction
      // แล้วค่อย connect ข้างใน → 2 Request พร้อมกัน (Double-submit) ผ่านเช็คทั้งคู่ สร้างใบวางบิล
      // ซ้อนที่ connect Invoice ชุดเดียวกัน — Compare-and-Set: อัปเดตเฉพาะ Invoice ที่ "ยังว่าง"
      // จริง ณ วินาทีนั้น ถ้าจำนวนไม่ครบ = มีคนชิงไปก่อน Rollback ทั้งหมด (รวมเลขรันทุกใบ)
      const attached = await tx.invoice.updateMany({
        where: { id: { in: payload.invoiceIds }, customerId, billingNoteId: null, status: { not: "CANCELLED" } },
        data: { billingNoteId: created.id },
      });
      if (attached.count !== payload.invoiceIds.length) {
        throw new Error(
          "มี Invoice บางใบที่เลือกไว้ถูกวางบิลไปแล้ว หรือถูกยกเลิกไปแล้ว — กรุณารีเฟรชหน้าแล้วเลือกใหม่"
        );
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          module: "BillingNote",
          recordId: created.id,
          newValue: { billingNoteNumber, invoiceIds: payload.invoiceIds },
        },
      });

      ids.push(created.id);
    }
    return ids;
  });

  revalidatePath("/billing-notes");
  // R7 — Owner Flow ข้อ 4: สร้างเสร็จ "ไปหน้าปริ้นได้" เลย — หลายใบ = Print Queue ต่อเนื่อง
  // R11 — Owner ข้อ 3: ปุ่ม "← กลับ" ของหน้าพิมพ์ต้องพากลับหน้าเลือกใบเดิม (ลูกค้า/ช่วงวันที่
  // เดิม) ไม่ใช่หน้ารายการ — Validate เป็น Internal Path ใต้ /billing-notes/new เท่านั้น
  const safeReturnTo =
    returnTo && returnTo.startsWith("/billing-notes/new") && !returnTo.startsWith("//") ? returnTo : "/billing-notes/new";
  const printParams = new URLSearchParams();
  printParams.set("back", safeReturnTo);
  if (createdIds.length > 1) printParams.set("queue", createdIds.slice(1).join(","));
  redirect(`/billing-notes/${createdIds[0]}/print?${printParams.toString()}`);
}

export async function createBillingNoteAction(formData: FormData) {
  const customerId = String(formData.get("customerId"));
  const billingNoteDate = String(formData.get("billingNoteDate"));
  const invoiceIds = formData.getAll("invoiceIds").map(String);
  const applyDiscount = formData.get("applyDiscount") === "on";
  // R11 — ข้อ 7: Checkbox "รวมใบเดียว ไม่แยกตามกลุ่มส่วนลด" (ไม่ติ๊ก = แยกแบบเดิม)
  const splitByGroup = formData.get("noSplit") !== "on";
  const returnTo = String(formData.get("returnTo") || "");
  // Owner UAT Bug Fix — Submit โดยไม่เลือกใบไหนเลย: เดิม throw ทะลุเป็น Error Boundary
  // เต็มหน้า → เด้งกลับหน้าเดิมพร้อมข้อความสุภาพแทน (ปกติปุ่มถูก disabled ฝั่ง Client
  // อยู่แล้ว — Guard นี้รองรับกรณี JS ถูกปิด) — Validation Rule เดิมใน createBillingNote
  // ยังอยู่ครบ ไม่แตะ
  if (invoiceIds.length === 0) {
    redirect(`/billing-notes/new?customerId=${encodeURIComponent(customerId)}&err=noneSelected`);
  }
  await createBillingNote(customerId, invoiceIds, billingNoteDate, applyDiscount, returnTo, splitByGroup);
}

// Smoke Test R5 (2026-08-25) — PRINTED Checkpoint ของใบวางบิล (Pattern เดียวกับ
// markInvoicePrinted ทุกบรรทัด): Owner พบว่าเดิมสร้างใบปุ๊บขึ้น "ยืนยันแล้ว" ทันทีทั้งที่ยัง
// ไม่ได้กดพิมพ์เลย — ตอนนี้ CONFIRMED = ยังไม่พิมพ์, จะเป็น PRINTED ได้ต้องผ่าน Confirmation
// Modal หลังพิมพ์จริง (PrintButton เดิม — เปิดเฉพาะโปรไฟล์ 9×11 และ Server เช็ค Profile
// ซ้ำอีกชั้นตรงนี้) — Reprint ทำได้เสมอไม่ว่าสถานะไหน (ปุ่มพิมพ์ไม่เคยถูกล็อก) แค่ไม่เขียน
// printedAt ทับของเดิม (Write-once ผ่าน CAS)
export async function markBillingNotePrinted(billingNoteId: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "billingNote.create")) throw new Error("FORBIDDEN");

  const printProfile = String(formData.get("printProfile") || "");

  const note = await db.billingNote.findUniqueOrThrow({ where: { id: billingNoteId } });
  if (note.status === "CANCELLED") throw new Error("ใบวางบิลนี้ถูกยกเลิกแล้ว พิมพ์ไม่ได้");
  if (note.status === "CONFIRMED" && printProfile === "continuous") {
    const printedAt = new Date();
    const cas = await db.billingNote.updateMany({
      where: { id: billingNoteId, status: "CONFIRMED" },
      data: { status: "PRINTED", printedAt, printedById: user.id },
    });
    if (cas.count === 1)
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          module: "BillingNote",
          recordId: billingNoteId,
          oldValue: { status: "CONFIRMED" },
          newValue: { status: "PRINTED", printedAt: printedAt.toISOString(), printProfile },
        },
      });
  }
  revalidatePath(`/billing-notes/${billingNoteId}`);
  revalidatePath("/billing-notes");
}

// ยกเลิกใบวางบิล — ปลด Invoice กลับไปเป็น "ยังไม่ถูกวางบิล" เพื่อวางบิลใหม่ได้
export async function cancelBillingNote(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "billingNote.cancel")) throw new Error("FORBIDDEN");

  const billingNote = await db.billingNote.findUniqueOrThrow({ where: { id }, include: { invoices: true } });
  // Phase E1 — return แทน throw สำหรับ Validation Error ที่คาดไว้แล้ว (ดู
  // src/lib/action-result.ts สำหรับ root cause)
  if (billingNote.status === "CANCELLED") return { success: false, error: "ใบวางบิลนี้ถูกยกเลิกไปแล้ว" };

  // Final Audit — CAS กัน Concurrent Cancel ซ้ำ (Pattern C1/C2 เดิม): ยกเลิกซ้อนกัน
  // 2 คำขอ → ตัวที่สองต้องไม่ปลด Invoice/เขียน Audit ซ้ำ — เขียนสถานะแบบมีเงื่อนไขก่อน
  // แล้วโยน Error เฉพาะกิจให้ Transaction Rollback ทั้งก้อน จับข้างนอกแปลงเป็นข้อความ
  // สุภาพ (Phase E1: Validation Error ที่คาดไว้ต้อง return ไม่ใช่ throw ทะลุ Boundary)
  const ALREADY = "BILLING_NOTE_ALREADY_CANCELLED";
  try {
    await db.$transaction(async (tx) => {
      // R5 — PRINTED ก็ยกเลิกได้เช่นกัน (เช่นวางบิลผิดใบหลังพิมพ์ไปแล้ว — Invoice ปลดกลับ
      // ไปวางบิลใหม่ได้ตาม Business Rule เดิม) — CAS กันซ้อนเหมือนเดิมทุกประการ
      const cas = await tx.billingNote.updateMany({
        where: { id, status: { in: ["CONFIRMED", "PRINTED"] } },
        data: { status: "CANCELLED" },
      });
      if (cas.count === 0) throw new Error(ALREADY);
      await tx.invoice.updateMany({
        where: { billingNoteId: id },
        data: { billingNoteId: null },
      });
      await releaseSeqIfLatest("BI", billingNote.billingNoteNumber, tx);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CANCEL",
          module: "BillingNote",
          recordId: id,
          oldValue: { status: billingNote.status },
          newValue: { status: "CANCELLED" },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === ALREADY) {
      return { success: false, error: "ใบวางบิลนี้ถูกยกเลิกไปแล้ว — กรุณารีเฟรชหน้า" };
    }
    throw err;
  }

  revalidatePath(`/billing-notes/${id}`);
  revalidatePath("/billing-notes");
  revalidatePath("/invoices");
  return { success: true };
}
