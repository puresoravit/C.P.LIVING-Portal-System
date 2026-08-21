"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productModelSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";
import { generateNextSku } from "@/lib/sku-sequence";
import { z } from "zod";

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

const batchSizeItemSchema = z.object({
  size: z.string(),
  price: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ"),
});

// R4 — Size Architecture Path A: "รุ่นสินค้า → เพิ่ม/จัดการ Size" — สร้าง Product
// Variant หลาย Size พร้อมกันในครั้งเดียว (Owner/Staff มองเป็น "รุ่นเดียว + หลาย Size"
// ไม่ต้องสร้าง Product ทีละตัวด้วยมือ) — ยังคงเป็น Product จริงด้านหลังทุกประการ
// (Pricing/Snapshot/Reports ไม่ต้องแก้อะไรเลย) แค่ automate การสร้างให้เร็วขึ้น —
// ต้องใช้สิทธิ์ product.edit เหมือน Create Product ปกติทุกประการ (Billing Staff ที่ไม่มี
// สิทธิ์นี้จะสร้าง Variant เองไม่ได้ — ตามที่อนุมัติไว้ชัดเจนว่าห้าม Auto-create จาก
// Billing Staff ตอนคีย์ Order/Quotation)
export async function batchCreateProductVariants(modelId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const model = await db.productModel.findUniqueOrThrow({ where: { id: modelId } });

  const unit = String(formData.get("unit") || "").trim();
  if (!unit) {
    return { success: false, error: "กรุณากรอกหน่วยนับ", fieldErrors: { unit: "กรุณากรอกหน่วยนับ" } };
  }

  let sizesRaw: unknown;
  try {
    sizesRaw = JSON.parse(String(formData.get("sizesJson") || "[]"));
  } catch {
    return { success: false, error: "ข้อมูลไซส์ไม่ถูกต้อง" };
  }
  const parsed = z.array(batchSizeItemSchema).safeParse(sizesRaw);
  if (!parsed.success || parsed.data.length === 0) {
    return { success: false, error: "กรุณาเลือกอย่างน้อย 1 ไซส์พร้อมราคา" };
  }

  // กันสร้างซ้ำกับ Size ที่มีอยู่แล้วของรุ่นนี้ (UI กรองไม่ให้เลือกซ้ำอยู่แล้ว แต่เช็คซ้ำ
  // ฝั่ง Server เป็น Safety Net เผื่อเปิดหลายแท็บพร้อมกัน)
  const existing = await db.product.findMany({ where: { modelId }, select: { size: true } });
  const existingSizes = new Set(existing.map((p) => p.size ?? ""));

  let created = 0;
  for (const item of parsed.data) {
    const sizeValue = item.size || null; // "" → null ("ไม่มีขนาด")
    if (existingSizes.has(sizeValue ?? "")) continue;

    const sku = await generateNextSku();
    const displayName = sizeValue ? `${model.name} ${sizeValue}` : model.name;
    const product = await db.product.create({
      data: {
        sku,
        name: displayName,
        productTypeId: model.productTypeId,
        modelId,
        size: sizeValue,
        unit,
        standardPrice: item.price,
      },
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        module: "Product",
        recordId: product.id,
        newValue: { sku, name: displayName, size: sizeValue, standardPrice: item.price, modelId, source: "BatchSizeCreate" },
      },
    });
    created++;
  }

  if (created === 0) {
    return { success: false, error: "ไม่มีไซส์ใหม่ที่สร้างได้ (ไซส์ที่เลือกไว้ถูกสร้างไปแล้วทั้งหมด)" };
  }

  revalidatePath(`/product-models/${modelId}`);
  revalidatePath("/products");
  return { success: true };
}
