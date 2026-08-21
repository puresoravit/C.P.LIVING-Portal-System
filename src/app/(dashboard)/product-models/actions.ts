"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productModelSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// Phase B — CRUD สำหรับ ProductModel (รุ่นสินค้า) ใช้ permission product.view/
// product.edit เดิม ตามที่อนุมัติ ไม่เพิ่ม Permission Key ใหม่
export async function createProductModel(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const parsed = productModelSchema.parse({
    productTypeId: formData.get("productTypeId"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") || 0,
  });

  const existing = await db.productModel.findFirst({
    where: { productTypeId: parsed.productTypeId, name: parsed.name },
  });
  if (existing) throw new Error(`รุ่นสินค้า "${parsed.name}" มีอยู่แล้วในประเภทสินค้านี้`);

  const model = await db.productModel.create({ data: parsed });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "ProductModel", recordId: model.id, newValue: parsed },
  });

  revalidatePath("/product-models");
  revalidatePath("/products");
}

export async function updateProductModel(id: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const parsed = productModelSchema.parse({
    productTypeId: formData.get("productTypeId"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") || 0,
  });

  const before = await db.productModel.findUnique({ where: { id } });
  const model = await db.productModel.update({ where: { id }, data: parsed });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "ProductModel",
      recordId: model.id,
      oldValue: before ?? undefined,
      newValue: parsed,
    },
  });

  revalidatePath("/product-models");
  revalidatePath("/products");
}

export async function toggleProductModelActive(id: string) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const model = await db.productModel.findUniqueOrThrow({ where: { id } });
  const updated = await db.productModel.update({ where: { id }, data: { active: !model.active } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: updated.active ? "ACTIVATE" : "DEACTIVATE",
      module: "ProductModel",
      recordId: id,
      oldValue: { active: model.active },
      newValue: { active: updated.active },
    },
  });

  revalidatePath("/product-models");
  revalidatePath("/products");
}

// Backfill workflow (Human-reviewed ตามที่อนุมัติ) — กำหนด Model ให้ Product หลายตัว
// พร้อมกันในครั้งเดียว จากหน้า /products (bulk assign) ไม่ auto-derive จากชื่อใดๆ
export async function bulkAssignProductModel(productIds: string[], modelId: string) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");
  if (productIds.length === 0) throw new Error("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");

  const model = await db.productModel.findUniqueOrThrow({ where: { id: modelId } });
  // ProductModel ผูกกับ ProductType เดียว — ห้ามให้ Product ต่างประเภทสินค้ากันมาอยู่
  // Model เดียวกัน (ไม่มี constraint ระดับ DB บังคับเรื่องนี้ ต้องเช็คที่นี่)
  const mismatched = await db.product.findMany({
    where: { id: { in: productIds }, productTypeId: { not: model.productTypeId } },
    select: { sku: true },
  });
  if (mismatched.length > 0) {
    throw new Error(
      `สินค้า ${mismatched.map((p) => p.sku).join(", ")} คนละประเภทสินค้ากับรุ่น "${model.name}" (${model.productTypeId}) — กำหนดรุ่นไม่ได้`
    );
  }

  await db.product.updateMany({ where: { id: { in: productIds } }, data: { modelId } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "Product",
      recordId: modelId,
      newValue: { bulkAssignModelId: modelId, productIds },
    },
  });

  revalidatePath("/products");
}
