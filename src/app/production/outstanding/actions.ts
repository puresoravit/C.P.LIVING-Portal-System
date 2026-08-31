"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { can } from "@/lib/permissions";
import { outstandingRemaining } from "@/lib/loading-reconcile";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";

// CP4 — ตัดยอดของค้าง (กฎข้อ 7): OWNER_ADMIN เท่านั้น · ตัดบางส่วน/ทั้งหมดได้ · ห้ามเกิน
// ยอดเหลือ · บังคับเหตุผล · append-only (แถว CUT ใน ledger เดิม — ไม่ใช่เหตุการณ์ขึ้นรถ:
// loadingLineId = null + kind CUT ชัดเจน ไม่หลอก) · ห้ามแตะ qtyOriginal/openedAt (D1 —
// partial cut ไม่ reset อายุ) · ปิดบัตรเมื่อเหลือ 0 — เหตุที่ปิด (ส่งครบ vs มีตัดยอด) derive
// จากส่วนผสมของ ledger เสมอ ไม่มีคอลัมน์ให้เขียนทับประวัติ
//
// ใช้ Serializable isolation: กัน race ตัดพร้อมกัน 2 คน หรือชนกับ reconcile ที่กำลัง
// allocate บัตรเดียวกัน (ทั้งคู่อ่านยอดเหลือแล้วค่อย insert — READ COMMITTED ปล่อยให้ตัดเกิน
// ได้) — ชนกันจริง Prisma โยน P2034 → ให้ผู้ใช้ลองใหม่

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

class NotOpenError extends Error {}
class OverRemainingError extends Error {}

export async function cutOutstanding(outstandingId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "outstanding.cancel")) throw new Error("FORBIDDEN");

  const qty = Number(formData.get("qty"));
  if (!Number.isInteger(qty) || qty <= 0) {
    return { success: false, error: "จำนวนที่จะตัดต้องเป็นจำนวนเต็มมากกว่า 0" };
  }
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) {
    return { success: false, error: "กรุณากรอกเหตุผลที่ตัดยอด", fieldErrors: { reason: "กรุณากรอกเหตุผลที่ตัดยอด" } };
  }

  try {
    await db.$transaction(
      async (tx) => {
        const card = await tx.outstandingDelivery.findFirst({
          where: { id: outstandingId, closedAt: null },
          include: { allocations: { select: { qty: true } } },
        });
        if (!card) throw new NotOpenError();
        const remaining = outstandingRemaining(card);
        if (qty > remaining) throw new OverRemainingError();

        await tx.loadingAllocation.create({
          data: { loadingLineId: null, kind: "CUT", outstandingId, customerPoLineId: null, qty, reason, actorId: user.id },
        });
        const now = new Date();
        const closesCard = qty === remaining;
        if (closesCard) {
          await tx.outstandingDelivery.update({ where: { id: outstandingId }, data: { closedAt: now } });
        }

        const poLine = await tx.customerPOLine.findUniqueOrThrow({
          where: { id: card.customerPoLineId },
          select: { customerPoId: true, customerPo: { select: { customerId: true, branchId: true } } },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "UPDATE",
            module: "Outstanding",
            recordId: outstandingId,
            customerId: poLine.customerPo.customerId,
            branchId: poLine.customerPo.branchId,
            customerPoId: poLine.customerPoId,
            reason,
            newValue: { event: "CUT_OUTSTANDING", qty, remainingAfter: remaining - qty, closed: closesCard },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (error instanceof NotOpenError) return { success: false, error: "บัตรค้างนี้ถูกปิดไปแล้ว — กรุณาโหลดหน้าใหม่" };
    if (error instanceof OverRemainingError) return { success: false, error: "ตัดเกินยอดที่เหลือค้างไม่ได้ — กรุณาโหลดหน้าใหม่แล้วดูยอดล่าสุด" };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { success: false, error: "มีการบันทึกชนกันพอดี — กรุณาลองอีกครั้ง" };
    }
    throw error;
  }
  revalidatePath("/production/outstanding");
  revalidatePath(`/production/outstanding/${outstandingId}`);
  revalidatePath("/production");
  return { success: true };
}
