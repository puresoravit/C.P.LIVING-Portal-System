"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { roundMoney } from "@/lib/pricing";
import { resolveBillingNoteDiscounts } from "@/lib/billing-note-discount";
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
// มารวมเป็นใบวางบิลใบเดียว — ป้องกันไม่ให้ Invoice ใบเดียวถูกวางบิลซ้ำ
// Smoke Test (2026-08-25) — applyDiscount: ติ๊ก "ใช้ส่วนลด" ตอนเลือกใบ → หักส่วนลดกลุ่ม
// ณ วันวางบิล เฉพาะใบที่ออกราคาเต็ม (ไม่หักซ้ำ — ดู resolveBillingNoteDiscounts) แล้วเก็บ
// Snapshot ต่อใบไว้ใน discountDetail — totalAmount กลายเป็นยอดสุทธิที่เรียกเก็บจริง
export async function createBillingNote(customerId: string, invoiceIds: string[], billingNoteDate: string, applyDiscount = false) {
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

  const grossTotal = roundMoney(invoices.reduce((s, inv) => s.add(inv.grandTotal), new Decimal(0)));
  const date = new Date(billingNoteDate);

  const discountResolution = applyDiscount
    ? await resolveBillingNoteDiscounts({
        customerId,
        billingNoteDate: date,
        invoices: invoices.map((inv) => ({
          id: inv.id,
          branchId: inv.branchId,
          productTypeCode: inv.productTypeCode,
          grandTotal: inv.grandTotal,
          discountAmount: inv.discountAmount,
        })),
      })
    : null;

  const totalAmount = discountResolution ? roundMoney(grossTotal.sub(discountResolution.discountTotal)) : grossTotal;
  const period = currentPeriod(date);

  const billingNote = await db.$transaction(async (tx) => {
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
        discountDetail: discountResolution ? discountResolution.lines : undefined,
        totalAmount,
        status: "CONFIRMED",
        createdById: user.id,
      },
    });

    // Stabilization — Concurrency Hardening: เดิมเช็ค "billingNoteId IS NULL" นอก Transaction
    // แล้วค่อย connect ข้างใน → 2 Request พร้อมกัน (Double-submit) ผ่านเช็คทั้งคู่ สร้างใบวางบิล
    // 2 ใบที่ connect Invoice ชุดเดียวกัน ใบที่ 2 เขียนทับ billingNoteId ทำให้ใบแรกกลายเป็น
    // ใบวางบิล Active ที่ไม่มี Invoice เลย — แก้เป็น Compare-and-Set: อัปเดตเฉพาะ Invoice ที่
    // "ยังว่าง" จริง ณ วินาทีนั้น ถ้าจำนวนไม่ครบ = มีคนชิงไปก่อน Rollback ทั้งหมด (รวมเลขรัน)
    const attached = await tx.invoice.updateMany({
      where: { id: { in: invoiceIds }, customerId, billingNoteId: null, status: { not: "CANCELLED" } },
      data: { billingNoteId: created.id },
    });
    if (attached.count !== invoiceIds.length) {
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
        newValue: { billingNoteNumber, invoiceIds },
      },
    });

    return created;
  });

  revalidatePath("/billing-notes");
  redirect(`/billing-notes/${billingNote.id}`);
}

export async function createBillingNoteAction(formData: FormData) {
  const customerId = String(formData.get("customerId"));
  const billingNoteDate = String(formData.get("billingNoteDate"));
  const invoiceIds = formData.getAll("invoiceIds").map(String);
  const applyDiscount = formData.get("applyDiscount") === "on";
  // Owner UAT Bug Fix — Submit โดยไม่เลือกใบไหนเลย: เดิม throw ทะลุเป็น Error Boundary
  // เต็มหน้า → เด้งกลับหน้าเดิมพร้อมข้อความสุภาพแทน (ปกติปุ่มถูก disabled ฝั่ง Client
  // อยู่แล้ว — Guard นี้รองรับกรณี JS ถูกปิด) — Validation Rule เดิมใน createBillingNote
  // ยังอยู่ครบ ไม่แตะ
  if (invoiceIds.length === 0) {
    redirect(`/billing-notes/new?customerId=${encodeURIComponent(customerId)}&err=noneSelected`);
  }
  await createBillingNote(customerId, invoiceIds, billingNoteDate, applyDiscount);
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
      const cas = await tx.billingNote.updateMany({
        where: { id, status: "CONFIRMED" },
        data: { status: "CANCELLED" },
      });
      if (cas.count === 0) throw new Error(ALREADY);
      await tx.invoice.updateMany({
        where: { billingNoteId: id },
        data: { billingNoteId: null },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CANCEL",
          module: "BillingNote",
          recordId: id,
          oldValue: { status: "CONFIRMED" },
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
