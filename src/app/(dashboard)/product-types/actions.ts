"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productTypeSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// ข้อ 6: Admin ต้องเพิ่ม Product Type ใหม่ได้เองจากหน้านี้ โดยไม่ต้องแก้ Source Code เลย
export async function createProductType(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productType.edit")) throw new Error("FORBIDDEN");

  const raw = productTypeSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    defaultDiscountPct: formData.get("defaultDiscountPct"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const existing = await db.productType.findUnique({ where: { code: parsed.code } });
  if (existing) {
    const error = `รหัสกลุ่มส่วนลด "${parsed.code}" มีอยู่แล้ว`;
    return { success: false, error, fieldErrors: { code: error } };
  }

  const productType = await db.productType.create({ data: parsed });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "ProductType", recordId: productType.id, newValue: parsed },
  });

  revalidatePath("/product-types");
  return { success: true };
}

export async function updateProductType(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productType.edit")) throw new Error("FORBIDDEN");

  const raw = productTypeSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    defaultDiscountPct: formData.get("defaultDiscountPct"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const existing = await db.productType.findUnique({ where: { code: parsed.code } });
  if (existing && existing.id !== id) {
    const error = `รหัสกลุ่มส่วนลด "${parsed.code}" มีอยู่แล้ว`;
    return { success: false, error, fieldErrors: { code: error } };
  }

  const before = await db.productType.findUnique({ where: { id } });
  const productType = await db.productType.update({ where: { id }, data: parsed });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "ProductType",
      recordId: productType.id,
      oldValue: before ?? undefined,
      newValue: parsed,
    },
  });

  revalidatePath("/product-types");
  return { success: true };
}

export async function toggleProductTypeActive(id: string) {
  const user = await requireUser();
  if (!can(user.role, "productType.edit")) throw new Error("FORBIDDEN");

  const pt = await db.productType.findUniqueOrThrow({ where: { id } });
  const updated = await db.productType.update({ where: { id }, data: { active: !pt.active } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: updated.active ? "ACTIVATE" : "DEACTIVATE",
      module: "ProductType",
      recordId: id,
      oldValue: { active: pt.active },
      newValue: { active: updated.active },
    },
  });

  revalidatePath("/product-types");
}
