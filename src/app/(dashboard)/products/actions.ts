"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";
import { generateNextSku } from "@/lib/sku-sequence";
import { syncStandardVariants } from "@/lib/product-variant-size";
import { Decimal } from "@prisma/client/runtime/library";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// Owner UAT — ข้อ 1: Product เป็น Size Family Anchor ของตัวเองได้ (ไม่ต้องพึ่ง
// ProductModel) — ตรวจว่ากรอก pricePerFoot มาถูกเงื่อนไขไหม (ต้องมี Category
// usesSize=true และห้ามผูก modelId พร้อมกัน เพราะ Product แถวเดียวเป็นได้แค่ Variant
// ของ Model หรือเป็น Anchor ของตัวเอง อย่างใดอย่างหนึ่งเท่านั้น ไม่ใช่ทั้งคู่พร้อมกัน)
function validateProductPricePerFoot(
  pricePerFoot: number | undefined,
  modelId: string | null | undefined,
  categoryUsesSize: boolean
): { error: string; fieldErrors: Record<string, string> } | null {
  if (pricePerFoot === undefined) return null;
  if (modelId) {
    const error = "สินค้านี้ผูกกับรุ่นสินค้าอยู่แล้ว ไม่สามารถตั้งราคาต่อฟุตของตัวเองซ้ำได้ (เลือกอย่างใดอย่างหนึ่ง)";
    return { error, fieldErrors: { pricePerFoot: error } };
  }
  if (!categoryUsesSize) {
    const error = "กำหนดราคาต่อฟุตได้เฉพาะสินค้าที่ประเภทสินค้าเป็นแบบมีขนาด (usesSize) เท่านั้น";
    return { error, fieldErrors: { pricePerFoot: error } };
  }
  return null;
}

// Owner UAT Fix Batch 3 — ข้อ 4: สินค้าที่ Category usesSize=true และไม่ได้ผูกรุ่นสินค้า
// (Legacy) เหลือ "ราคาต่อฟุต" เป็น Source ราคาเพียงช่องเดียว (ห้ามให้กรอก
// ราคาตั้งต้น/ราคาต่อฟุต ซ้ำกันสองช่อง) — Product.standardPrice ยังเป็น Column บังคับ
// ระดับ Schema เดิม (ไม่แตะ) จึง Derive มาจาก pricePerFoot ตรงๆ ให้อัตโนมัติในกรณีนี้
// (Anchor Product เองไม่เคยถูกเลือกขายตรงๆ ผ่าน getEffectivePrice อยู่แล้วในสถาปัตยกรรม
// ปัจจุบัน — ขายจริงผ่าน Size Variant ที่ syncStandardVariants สร้างให้เท่านั้น ค่านี้จึง
// เป็นแค่ Placeholder ที่สมเหตุสมผล ไม่กระทบราคาที่ใช้จริงเลย) — กรณีอื่น (usesSize=false
// หรือผูกรุ่นสินค้าอยู่) ยังคงบังคับกรอก standardPrice เองตามเดิมทุกประการ
function resolveProductStandardPrice(
  standardPrice: number | undefined,
  pricePerFoot: number | undefined,
  modelId: string | null | undefined,
  categoryUsesSize: boolean
): { value: number } | { error: string; fieldErrors: Record<string, string> } {
  const isSizedAnchor = categoryUsesSize && !modelId;
  if (isSizedAnchor) {
    if (pricePerFoot === undefined) {
      const error = "กรุณากรอกราคาต่อฟุต สำหรับสินค้าประเภทมีขนาดที่ไม่ได้ผูกรุ่นสินค้า";
      return { error, fieldErrors: { pricePerFoot: error } };
    }
    return { value: pricePerFoot };
  }
  if (standardPrice === undefined) {
    const error = "กรุณากรอกราคา";
    return { error, fieldErrors: { standardPrice: error } };
  }
  return { value: standardPrice };
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const raw = productSchema.safeParse({
    sku: formData.get("sku") || undefined,
    name: formData.get("name"),
    // R4 — กลุ่มส่วนลดว่างได้ (= "ไม่ระบุกลุ่มส่วนลด") ต้องแปลง "" จาก Select เป็น
    // undefined ก่อนเข้า Prisma ไม่งั้นจะพยายามผูก FK กับ Empty String
    productTypeId: formData.get("productTypeId") || undefined,
    // R6 — ประเภทสินค้า (ProductCategory) ว่างได้เช่นกัน คนละ FK จาก productTypeId
    categoryId: formData.get("categoryId") || undefined,
    modelId: formData.get("modelId") || null,
    size: formData.get("size") || undefined,
    unit: formData.get("unit"),
    standardPrice: formData.get("standardPrice") || undefined,
    description: formData.get("description") || undefined,
    pricePerFoot: formData.get("pricePerFoot") || undefined,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const category = parsed.categoryId ? await db.productCategory.findUnique({ where: { id: parsed.categoryId } }) : null;
  const pricePerFootError = validateProductPricePerFoot(parsed.pricePerFoot, parsed.modelId, category?.usesSize ?? false);
  if (pricePerFootError) {
    return { success: false, ...pricePerFootError };
  }
  const standardPriceResult = resolveProductStandardPrice(parsed.standardPrice, parsed.pricePerFoot, parsed.modelId, category?.usesSize ?? false);
  if ("error" in standardPriceResult) {
    return { success: false, ...standardPriceResult };
  }

  // R4 — รหัสสินค้า (Product.sku) เว้นว่างได้แล้ว: ถ้าไม่กรอก ให้ระบบสร้างให้อัตโนมัติผ่าน
  // ProductSkuSequence (Atomic, ไม่ผูกกับ ProductType เพราะ nullable แล้ว) ถ้ากรอกเอง ใช้ค่าที่กรอกตามเดิม
  const sku = parsed.sku || (await generateNextSku());

  // ข้อ 61: รหัสสินค้าห้ามซ้ำ
  const existing = await db.product.findUnique({ where: { sku } });
  if (existing) {
    const error = `รหัสสินค้า "${sku}" ถูกใช้งานแล้ว กรุณาใช้รหัสอื่น`;
    return { success: false, error, fieldErrors: { sku: error } };
  }

  const product = await db.$transaction(async (tx) => {
    const created = await tx.product.create({ data: { ...parsed, sku, standardPrice: standardPriceResult.value } });
    // Owner UAT — ข้อ 1: กรอก pricePerFoot มา = Product แถวนี้เป็น Anchor ของตัวเอง —
    // Sync Standard Variant (3/3.5/4/5/6 ฟุต) ให้ทันที เหมือน ProductModel ทุกประการ
    if (parsed.pricePerFoot !== undefined) {
      await syncStandardVariants(
        {
          parent: { kind: "product", productId: created.id },
          parentName: parsed.name,
          productTypeId: parsed.productTypeId || null,
          categoryId: parsed.categoryId || null,
          pricePerFoot: new Decimal(parsed.pricePerFoot),
          unit: parsed.unit,
        },
        tx
      );
    }
    return created;
  });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "Product", recordId: product.id, newValue: { ...parsed, sku, standardPrice: standardPriceResult.value } },
  });

  revalidatePath("/products");
  return { success: true };
}

export async function updateProduct(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const raw = productSchema.safeParse({
    sku: formData.get("sku") || undefined,
    name: formData.get("name"),
    productTypeId: formData.get("productTypeId") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    modelId: formData.get("modelId") || null,
    size: formData.get("size") || undefined,
    unit: formData.get("unit"),
    standardPrice: formData.get("standardPrice") || undefined,
    description: formData.get("description") || undefined,
    pricePerFoot: formData.get("pricePerFoot") || undefined,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;
  if (!parsed.sku) {
    return { success: false, error: "กรุณากรอกรหัสสินค้า", fieldErrors: { sku: "กรุณากรอกรหัสสินค้า" } };
  }

  const existing = await db.product.findUnique({ where: { sku: parsed.sku } });
  if (existing && existing.id !== id) {
    const error = `รหัสสินค้า "${parsed.sku}" ถูกใช้งานแล้ว กรุณาใช้รหัสอื่น`;
    return { success: false, error, fieldErrors: { sku: error } };
  }

  const category = parsed.categoryId ? await db.productCategory.findUnique({ where: { id: parsed.categoryId } }) : null;
  const pricePerFootError = validateProductPricePerFoot(parsed.pricePerFoot, parsed.modelId, category?.usesSize ?? false);
  if (pricePerFootError) {
    return { success: false, ...pricePerFootError };
  }
  const standardPriceResult = resolveProductStandardPrice(parsed.standardPrice, parsed.pricePerFoot, parsed.modelId, category?.usesSize ?? false);
  if ("error" in standardPriceResult) {
    return { success: false, ...standardPriceResult };
  }

  const before = await db.product.findUnique({ where: { id } });
  const product = await db.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: {
        ...parsed,
        productTypeId: parsed.productTypeId ?? null,
        categoryId: parsed.categoryId ?? null,
        standardPrice: standardPriceResult.value,
      },
    });
    // Owner UAT — ข้อ 1: Recalculate เฉพาะตอนกรอก pricePerFoot มาจริง (ขอบเขตเดียวกับ
    // ProductModel — แตะเฉพาะ Standard Variant ของ Anchor นี้ ไม่แตะ PriceRule/
    // DiscountRule/Historical Snapshot ใดๆ) ถ้าลบ pricePerFoot ออก จะไม่ลบ/ปรับ Variant เดิม
    if (parsed.pricePerFoot !== undefined) {
      await syncStandardVariants(
        {
          parent: { kind: "product", productId: updated.id },
          parentName: parsed.name,
          productTypeId: parsed.productTypeId || null,
          categoryId: parsed.categoryId || null,
          pricePerFoot: new Decimal(parsed.pricePerFoot),
          unit: parsed.unit,
        },
        tx
      );
    }
    return updated;
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "Product",
      recordId: product.id,
      oldValue: before ?? undefined,
      newValue: { ...parsed, standardPrice: standardPriceResult.value },
    },
  });

  revalidatePath("/products");
  return { success: true };
}

// Owner UAT — ข้อ 2: "ลบ" ในมุมผู้ใช้ แต่ Implementation ต้องรักษา Referential
// Integrity + Historical Record เสมอ — Audit FK จริงก่อนเลือกวิธี: ถ้าไม่มี Document/
// PriceRule/Size Variant ใดๆ อ้างอิงอยู่เลย ลบจริงได้ปลอดภัย 100% (Hard Delete) — ถ้ามี
// ผูกอยู่ (แม้เอกสารนั้นจะถูกยกเลิกไปแล้วก็ตาม เพราะ Invoice/Quotation ที่ยกเลิกก็ยังต้อง
// เปิดดู/พิมพ์ย้อนหลังได้เสมอ) ต้องเก็บแถวไว้ (Soft Delete ผ่าน active=false เดิม — ทำให้
// หายจาก /api/products/search ทันทีเพราะ Query ทุกจุดกรอง active:true อยู่แล้ว ไม่ต้องมี
// Field ใหม่) — ปุ่ม UI ยังเขียนว่า "ลบ" เหมือนกันทั้งสองแบบ ต่างกันแค่ Toast ข้อความ
export async function deleteProduct(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const product = await db.product.findUnique({
    where: { id },
    include: {
      _count: {
        select: { priceRules: true, orderItems: true, invoiceItems: true, quotationItems: true, sizeVariants: true },
      },
    },
  });
  if (!product) return { success: false, error: "ไม่พบสินค้านี้" };

  const { priceRules, orderItems, invoiceItems, quotationItems, sizeVariants } = product._count;
  const totalRefs = priceRules + orderItems + invoiceItems + quotationItems + sizeVariants;

  if (totalRefs === 0) {
    await db.product.delete({ where: { id } });
    await db.auditLog.create({
      data: { userId: user.id, action: "DELETE", module: "Product", recordId: id, oldValue: { sku: product.sku, name: product.name } },
    });
    revalidatePath("/products");
    return { success: true };
  }

  // ยังมีการอ้างอิงอยู่ (เอกสาร/ราคาเฉพาะ/Size Variant) — ลบจริงไม่ได้ เพราะจะทำให้
  // Historical Document เปิด/พิมพ์ไม่ได้ หรือ Size Variant กำพร้า — ปิดใช้งานแทน (หายจาก
  // Search ทันที เหมือนที่ Requirement ต้องการ) เอกสารเก่ายังอ่าน Snapshot ได้ปกติทุกประการ
  const before = product.active;
  await db.product.update({ where: { id }, data: { active: false } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "DEACTIVATE",
      module: "Product",
      recordId: id,
      oldValue: { active: before, reason: "delete-blocked-by-references", refs: product._count },
      newValue: { active: false },
    },
  });
  revalidatePath("/products");
  return {
    success: true,
    message: `ปิดใช้งานสินค้านี้แทนการลบจริง เนื่องจากมีการใช้งานในเอกสาร/ราคาเฉพาะ/ขนาดย่อยอยู่แล้ว ${totalRefs} รายการ (จะไม่ขึ้นในการค้นหาสินค้าสำหรับเอกสารใหม่อีกต่อไป แต่เอกสารเก่ายังเปิด/พิมพ์ได้ปกติ)`,
  };
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
