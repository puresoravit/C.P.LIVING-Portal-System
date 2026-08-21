"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { dateRangesOverlap } from "@/lib/pricing";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";

const discountRuleSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  branchId: z.string().optional(),
  productTypeId: z.string().min(1, "กรุณาเลือกประเภทสินค้า"),
  discountPct: z.coerce.number().min(0).max(100, "ส่วนลดต้องอยู่ระหว่าง 0-100%"),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.string().optional(),
});

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function createDiscountRule(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "discount.edit")) throw new Error("FORBIDDEN");

  const rawParse = discountRuleSchema.safeParse({
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId") || undefined,
    productTypeId: formData.get("productTypeId"),
    discountPct: formData.get("discountPct"),
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") || undefined,
  });
  if (!rawParse.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(rawParse.error) };
  }
  const raw = rawParse.data;

  const branchId = raw.branchId || null;
  const effectiveTo = raw.effectiveTo ? new Date(raw.effectiveTo) : null;

  // ข้อ 61: ห้ามช่วง Effective Date ซ้อนกัน สำหรับ scope เดียวกัน
  // (customer + branch + productType เดียวกัน)
  const sameScope = await db.discountRule.findMany({
    where: { customerId: raw.customerId, branchId, productTypeId: raw.productTypeId },
  });
  const hasOverlap = sameScope.some((r) =>
    dateRangesOverlap(raw.effectiveFrom, effectiveTo, r.effectiveFrom, r.effectiveTo)
  );
  if (hasOverlap) {
    const error = "ช่วงวันที่มีผล (Effective Date) ซ้อนกับส่วนลดที่ตั้งไว้แล้วสำหรับลูกค้า/สาขา/ประเภทสินค้านี้";
    return { success: false, error, fieldErrors: { effectiveFrom: error } };
  }

  const discountRule = await db.discountRule.create({
    data: {
      customerId: raw.customerId,
      branchId,
      productTypeId: raw.productTypeId,
      discountPct: raw.discountPct,
      effectiveFrom: raw.effectiveFrom,
      effectiveTo,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      module: "Discount",
      recordId: discountRule.id,
      newValue: { ...raw, branchId, effectiveTo },
    },
  });

  revalidatePath("/discounts");
  return { success: true };
}

export async function deleteDiscountRule(id: string) {
  const user = await requireUser();
  if (!can(user.role, "discount.edit")) throw new Error("FORBIDDEN");

  const before = await db.discountRule.findUniqueOrThrow({ where: { id } });
  await db.discountRule.delete({ where: { id } });

  await db.auditLog.create({
    data: { userId: user.id, action: "DELETE", module: "Discount", recordId: id, oldValue: before },
  });

  revalidatePath("/discounts");
}
