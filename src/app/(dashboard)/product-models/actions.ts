"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productModelSchema } from "@/lib/validation";
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

// Phase B — CRUD สำหรับ ProductModel (รุ่นสินค้า) ใช้ permission product.view/
// product.edit เดิม ตามที่อนุมัติ ไม่เพิ่ม Permission Key ใหม่
export async function createProductModel(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const raw = productModelSchema.safeParse({
    productTypeId: formData.get("productTypeId"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const existing = await db.productModel.findFirst({
    where: { productTypeId: parsed.productTypeId, name: parsed.name },
  });
  if (existing) {
    const error = `รุ่นสินค้า "${parsed.name}" มีอยู่แล้วในประเภทสินค้านี้`;
    return { success: false, error, fieldErrors: { name: error } };
  }

  const model = await db.productModel.create({ data: parsed });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "ProductModel", recordId: model.id, newValue: parsed },
  });

  revalidatePath("/product-models");
  revalidatePath("/products");
  return { success: true };
}

export async function updateProductModel(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const raw = productModelSchema.safeParse({
    productTypeId: formData.get("productTypeId"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const existing = await db.productModel.findFirst({
    where: { productTypeId: parsed.productTypeId, name: parsed.name },
  });
  if (existing && existing.id !== id) {
    const error = `รุ่นสินค้า "${parsed.name}" มีอยู่แล้วในประเภทสินค้านี้`;
    return { success: false, error, fieldErrors: { name: error } };
  }

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
  return { success: true };
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
export async function bulkAssignProductModel(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const productIds = formData.getAll("productId").map(String);
  const modelId = String(formData.get("modelId") || "");

  if (!modelId) {
    return { success: false, error: "กรุณาเลือกรุ่นสินค้า", fieldErrors: { modelId: "กรุณาเลือกรุ่นสินค้า" } };
  }
  if (productIds.length === 0) {
    return { success: false, error: "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ" };
  }

  const model = await db.productModel.findUniqueOrThrow({ where: { id: modelId } });
  // ProductModel ผูกกับ ProductType เดียว — ห้ามให้ Product ต่างประเภทสินค้ากันมาอยู่
  // Model เดียวกัน (ไม่มี constraint ระดับ DB บังคับเรื่องนี้ ต้องเช็คที่นี่)
  const mismatched = await db.product.findMany({
    where: { id: { in: productIds }, productTypeId: { not: model.productTypeId } },
    select: { sku: true },
  });
  if (mismatched.length > 0) {
    const error = `สินค้า ${mismatched.map((p) => p.sku).join(", ")} คนละประเภทสินค้ากับรุ่น "${model.name}" — กำหนดรุ่นไม่ได้`;
    return { success: false, error, fieldErrors: { modelId: error } };
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
  return { success: true };
}
