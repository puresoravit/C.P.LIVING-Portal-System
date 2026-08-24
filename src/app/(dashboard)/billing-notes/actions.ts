"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { roundMoney } from "@/lib/pricing";
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
export async function createBillingNote(customerId: string, invoiceIds: string[], billingNoteDate: string) {
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

  const totalAmount = roundMoney(invoices.reduce((s, inv) => s.add(inv.grandTotal), new Decimal(0)));
  const date = new Date(billingNoteDate);
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
  // Owner UAT Bug Fix — Submit โดยไม่เลือกใบไหนเลย: เดิม throw ทะลุเป็น Error Boundary
  // เต็มหน้า → เด้งกลับหน้าเดิมพร้อมข้อความสุภาพแทน (ปกติปุ่มถูก disabled ฝั่ง Client
  // อยู่แล้ว — Guard นี้รองรับกรณี JS ถูกปิด) — Validation Rule เดิมใน createBillingNote
  // ยังอยู่ครบ ไม่แตะ
  if (invoiceIds.length === 0) {
    redirect(`/billing-notes/new?customerId=${encodeURIComponent(customerId)}&err=noneSelected`);
  }
  await createBillingNote(customerId, invoiceIds, billingNoteDate);
}

// ยกเลิกใบวางบิล — ปลด Invoice กลับไปเป็น "ยังไม่ถูกวางบิล" เพื่อวางบิลใหม่ได้
export async function cancelBillingNote(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "billingNote.cancel")) throw new Error("FORBIDDEN");

  const billingNote = await db.billingNote.findUniqueOrThrow({ where: { id }, include: { invoices: true } });
  // Phase E1 — return แทน throw สำหรับ Validation Error ที่คาดไว้แล้ว (ดู
  // src/lib/action-result.ts สำหรับ root cause)
  if (billingNote.status === "CANCELLED") return { success: false, error: "ใบวางบิลนี้ถูกยกเลิกไปแล้ว" };

  await db.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { billingNoteId: id },
      data: { billingNoteId: null },
    });
    await tx.billingNote.update({ where: { id }, data: { status: "CANCELLED" } });
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

  revalidatePath(`/billing-notes/${id}`);
  revalidatePath("/billing-notes");
  revalidatePath("/invoices");
  return { success: true };
}
