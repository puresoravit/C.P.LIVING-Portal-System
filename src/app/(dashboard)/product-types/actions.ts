"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productTypeSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// ข้อ 6: Admin ต้องเพิ่ม Product Type ใหม่ได้เองจากหน้านี้ โดยไม่ต้องแก้ Source Code เลย
export async function createProductType(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "productType.edit")) throw new Error("FORBIDDEN");

  const parsed = productTypeSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
  });

  const existing = await db.productType.findUnique({ where: { code: parsed.code } });
  if (existing) throw new Error(`รหัสประเภทสินค้า "${parsed.code}" มีอยู่แล้ว`);

  const productType = await db.productType.create({ data: parsed });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "ProductType", recordId: productType.id, newValue: parsed },
  });

  revalidatePath("/product-types");
}

export async function updateProductType(id: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "productType.edit")) throw new Error("FORBIDDEN");

  const parsed = productTypeSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
  });

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
