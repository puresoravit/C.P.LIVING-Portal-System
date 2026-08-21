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

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const raw = productSchema.safeParse({
    sku: formData.get("sku") || undefined,
    name: formData.get("name"),
    // R4 — ประเภทสินค้าว่างได้ (= "ไม่ระบุประเภท") ต้องแปลง "" จาก Select เป็น
    // undefined ก่อนเข้า Prisma ไม่งั้นจะพยายามผูก FK กับ Empty String
    productTypeId: formData.get("productTypeId") || undefined,
    modelId: formData.get("modelId") || null,
    size: formData.get("size") || undefined,
    unit: formData.get("unit"),
    standardPrice: formData.get("standardPrice"),
    description: formData.get("description") || undefined,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  // R4 — SKU เว้นว่างได้แล้ว: ถ้าไม่กรอก ให้ระบบสร้างให้อัตโนมัติผ่าน ProductSkuSequence
  // (Atomic, ไม่ผูกกับ ProductType เพราะ nullable แล้ว) ถ้ากรอกเอง ใช้ค่าที่กรอกตามเดิม
  const sku = parsed.sku || (await generateNextSku());

  // ข้อ 61: SKU ห้ามซ้ำ
  const existing = await db.product.findUnique({ where: { sku } });
  if (existing) {
    const error = `SKU "${sku}" มีอยู่แล้วในระบบ`;
    return { success: false, error, fieldErrors: { sku: error } };
  }

  const product = await db.product.create({ data: { ...parsed, sku } });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "Product", recordId: product.id, newValue: { ...parsed, sku } },
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
    modelId: formData.get("modelId") || null,
    size: formData.get("size") || undefined,
    unit: formData.get("unit"),
    standardPrice: formData.get("standardPrice"),
    description: formData.get("description") || undefined,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;
  if (!parsed.sku) {
    return { success: false, error: "กรุณากรอก SKU", fieldErrors: { sku: "กรุณากรอก SKU" } };
  }

  const existing = await db.product.findUnique({ where: { sku: parsed.sku } });
  if (existing && existing.id !== id) {
    const error = `SKU "${parsed.sku}" มีอยู่แล้วในระบบ`;
    return { success: false, error, fieldErrors: { sku: error } };
  }

  const before = await db.product.findUnique({ where: { id } });
  const product = await db.product.update({
    where: { id },
    data: { ...parsed, productTypeId: parsed.productTypeId ?? null },
  });

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
  return { success: true };
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
