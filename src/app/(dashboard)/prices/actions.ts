"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { dateRangesOverlap } from "@/lib/pricing";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const priceRuleSchema = z.object({
  productId: z.string().min(1, "กรุณาเลือกสินค้า"),
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  branchId: z.string().optional(), // ว่าง = ใช้กับทุกสาขาของลูกค้ารายนี้ (Customer Price)
  price: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ"),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.string().optional(), // ว่าง = ไม่มีวันหมดอายุ
});

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function createPriceRule(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "price.edit")) throw new Error("FORBIDDEN");

  const raw = priceRuleSchema.parse({
    productId: formData.get("productId"),
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId") || undefined,
    price: formData.get("price"),
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") || undefined,
  });

  const branchId = raw.branchId || null;
  const effectiveTo = raw.effectiveTo ? new Date(raw.effectiveTo) : null;

  // ข้อ 61: ห้ามช่วง Effective Date ซ้อนกันโดยไม่ตั้งใจ สำหรับ scope เดียวกัน
  // (product + customer + branch เดียวกัน)
  const sameScope = await db.priceRule.findMany({
    where: { productId: raw.productId, customerId: raw.customerId, branchId },
  });
  const hasOverlap = sameScope.some((r) =>
    dateRangesOverlap(raw.effectiveFrom, effectiveTo, r.effectiveFrom, r.effectiveTo)
  );
  if (hasOverlap) {
    throw new Error(
      "ช่วงวันที่มีผล (Effective Date) ซ้อนกับราคาที่ตั้งไว้แล้วสำหรับสินค้า/ลูกค้า/สาขานี้ — กรุณาปรับช่วงวันที่"
    );
  }

  const priceRule = await db.priceRule.create({
    data: {
      productId: raw.productId,
      customerId: raw.customerId,
      branchId,
      price: raw.price,
      effectiveFrom: raw.effectiveFrom,
      effectiveTo,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      module: "Price",
      recordId: priceRule.id,
      newValue: { ...raw, branchId, effectiveTo },
    },
  });

  revalidatePath("/prices");
}

export async function deletePriceRule(id: string) {
  const user = await requireUser();
  if (!can(user.role, "price.edit")) throw new Error("FORBIDDEN");

  // Price Rule ยังไม่เคยถูกใช้จริงใน Invoice (Invoice snapshot ราคาแยกแล้ว)
  // จึงลบได้ตรงๆ ไม่ผิดหลัก Data Integrity ของข้อ 48 (ต่างจาก Master Data/Transaction)
  const before = await db.priceRule.findUniqueOrThrow({ where: { id } });
  await db.priceRule.delete({ where: { id } });

  await db.auditLog.create({
    data: { userId: user.id, action: "DELETE", module: "Price", recordId: id, oldValue: before },
  });

  revalidatePath("/prices");
}
