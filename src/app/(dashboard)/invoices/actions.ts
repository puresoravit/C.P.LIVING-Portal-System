"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

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
export async function cancelInvoice(invoiceId: string) {
  const user = await requireUser();
  if (!can(user.role, "invoice.cancel")) throw new Error("FORBIDDEN");

  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.status === "CANCELLED") throw new Error("Invoice นี้ถูกยกเลิกไปแล้ว");

  const beforeStatus = invoice.status;
  await db.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "CANCEL",
      module: "Invoice",
      recordId: invoiceId,
      oldValue: { status: beforeStatus },
      newValue: { status: "CANCELLED" },
    },
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath(`/orders/${invoice.parentOrderId}`);
}

// ข้อ 28: PRINTED เป็นสถานะที่บอกว่าเคยพิมพ์แล้ว — เตรียมไว้ก่อนสำหรับ Phase 5
export async function markInvoicePrinted(invoiceId: string) {
  const user = await requireUser();
  if (!can(user.role, "invoice.print")) throw new Error("FORBIDDEN");

  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.status === "CANCELLED") throw new Error("Invoice นี้ถูกยกเลิกแล้ว พิมพ์ไม่ได้");
  if (invoice.status === "CONFIRMED") {
    await db.invoice.update({ where: { id: invoiceId }, data: { status: "PRINTED" } });
  }
  revalidatePath(`/invoices/${invoiceId}`);
}
