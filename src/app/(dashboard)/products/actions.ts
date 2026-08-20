"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function createProduct(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const parsed = productSchema.parse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    productTypeId: formData.get("productTypeId"),
    size: formData.get("size") || undefined,
    unit: formData.get("unit"),
    standardPrice: formData.get("standardPrice"),
    description: formData.get("description") || undefined,
  });

  // ข้อ 61: SKU ห้ามซ้ำ
  const existing = await db.product.findUnique({ where: { sku: parsed.sku } });
  if (existing) throw new Error(`SKU "${parsed.sku}" มีอยู่แล้วในระบบ`);

  const product = await db.product.create({ data: parsed });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "Product", recordId: product.id, newValue: parsed },
  });

  revalidatePath("/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const parsed = productSchema.parse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    productTypeId: formData.get("productTypeId"),
    size: formData.get("size") || undefined,
    unit: formData.get("unit"),
    standardPrice: formData.get("standardPrice"),
    description: formData.get("description") || undefined,
  });

  const before = await db.product.findUnique({ where: { id } });
  const product = await db.product.update({ where: { id }, data: parsed });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "Product",
      recordId: product.id,
      oldValue: before ?? undefined,
      newValue: parsed,
    },
  });

  revalidatePath("/products");
}

export async function toggleProductActive(id: string) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const p = await db.product.findUniqueOrThrow({ where: { id } });
  const updated = await db.product.update({ where: { id }, data: { active: !p.active } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: updated.active ? "ACTIVATE" : "DEACTIVATE",
      module: "Product",
      recordId: id,
      oldValue: { active: p.active },
      newValue: { active: updated.active },
    },
  });

  revalidatePath("/products");
}
