"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// Owner UAT (2026-08-29) — "ยืนยันว่าส่งของค้างไปแล้ว" ปิด Checklist เฉยๆ ไม่แตะตัวเลข
// เอกสารใดๆ เลยตามที่ Owner ยืนยัน — ใช้สิทธิ์ invoice.create เดียวกับที่แก้ไข Invoice
// ได้อยู่แล้ว (ไม่มี Permission ใหม่ ตาม Pattern เดิมของระบบที่ไม่แยก .view ต่างหาก)
export async function resolvePendingRedelivery(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "invoice.create")) throw new Error("FORBIDDEN");

  const record = await db.invoicePendingRedelivery.findUniqueOrThrow({ where: { id } });
  if (record.resolvedAt) return { success: false, error: "รายการนี้ถูกปิดไปแล้ว" };

  const cas = await db.invoicePendingRedelivery.updateMany({
    where: { id, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: user.id },
  });
  if (cas.count === 0) {
    return { success: false, error: "รายการนี้ถูกปิดไปแล้วโดยผู้อื่น — กรุณารีเฟรชหน้า" };
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "InvoicePendingRedelivery",
      recordId: id,
      oldValue: { resolvedAt: null },
      newValue: { resolvedAt: new Date().toISOString(), note: "ยืนยันว่าส่งของค้างไปแล้ว" },
    },
  });

  revalidatePath("/pending-redelivery");
  revalidatePath(`/pending-redelivery/${id}`);
  return { success: true, message: "ปิดรายการค้างส่งเรียบร้อย" };
}
