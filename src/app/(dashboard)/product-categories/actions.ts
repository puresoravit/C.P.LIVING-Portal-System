"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productCategorySchema } from "@/lib/validation";
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

// R6 — CRUD สำหรับ ProductCategory (ประเภทสินค้าเชิงคุณลักษณะ) ใช้ permission
// product.view/product.edit เดิม ตามที่อนุมัติ (Precedent เดียวกับ ProductModel) —
// ไม่เพิ่ม Permission Key ใหม่
export async function createProductCategory(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const raw = productCategorySchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    usesSize: formData.get("usesSize") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const existing = await db.productCategory.findUnique({ where: { code: parsed.code } });
  if (existing) {
    const error = `รหัสประเภทสินค้า "${parsed.code}" มีอยู่แล้ว`;
    return { success: false, error, fieldErrors: { code: error } };
  }

  const category = await db.productCategory.create({ data: parsed });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "ProductCategory", recordId: category.id, newValue: parsed },
  });

  revalidatePath("/product-categories");
  return { success: true };
}

export async function updateProductCategory(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const raw = productCategorySchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    usesSize: formData.get("usesSize") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const existing = await db.productCategory.findUnique({ where: { code: parsed.code } });
  if (existing && existing.id !== id) {
    const error = `รหัสประเภทสินค้า "${parsed.code}" มีอยู่แล้ว`;
    return { success: false, error, fieldErrors: { code: error } };
  }

  const before = await db.productCategory.findUnique({ where: { id } });
  const category = await db.productCategory.update({ where: { id }, data: parsed });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "ProductCategory",
      recordId: category.id,
      oldValue: before ?? undefined,
      newValue: parsed,
    },
  });

  revalidatePath("/product-categories");
  return { success: true };
}

// Owner UAT Round 2 — ข้อ 1: "ลบได้จะดีกว่าไหม จะได้ไม่รกตา" — ลบจริงได้เฉพาะตอนไม่มี
// Product/ProductModel ผูกอยู่เลย (ปลอดภัย 100% ไม่มี FK ให้ต้อง Cascade/บัง) ถ้ามีข้อมูล
// ผูกอยู่ ยังต้องใช้ "ปิดใช้งาน" เดิมเท่านั้น (ห้าม Hard Delete ประเภทที่มี Historical
// Reference อยู่ ตาม Convention เดิมของทั้งระบบที่ไม่เคย Hard Delete Master Data ที่ถูก
// อ้างอิงอยู่เลยสักจุด)
export async function deleteProductCategory(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const category = await db.productCategory.findUnique({
    where: { id },
    include: { _count: { select: { products: true, models: true } } },
  });
  if (!category) return { success: false, error: "ไม่พบประเภทสินค้านี้" };
  if (category._count.products > 0 || category._count.models > 0) {
    return {
      success: false,
      error: `ลบไม่ได้ — ยังมีสินค้า/รุ่นสินค้าผูกกับประเภทนี้อยู่ ${category._count.products} สินค้า / ${category._count.models} รุ่น กรุณาย้ายไปประเภทอื่นหรือลบข้อมูลที่ผูกอยู่ก่อน (หรือใช้ "ปิดใช้งาน" แทน)`,
    };
  }

  await db.productCategory.delete({ where: { id } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "DELETE",
      module: "ProductCategory",
      recordId: id,
      oldValue: { code: category.code, name: category.name },
    },
  });

  revalidatePath("/product-categories");
  return { success: true };
}

export async function toggleProductCategoryActive(id: string) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const c = await db.productCategory.findUniqueOrThrow({ where: { id } });
  const updated = await db.productCategory.update({ where: { id }, data: { active: !c.active } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: updated.active ? "ACTIVATE" : "DEACTIVATE",
      module: "ProductCategory",
      recordId: id,
      oldValue: { active: c.active },
      newValue: { active: updated.active },
    },
  });

  revalidatePath("/product-categories");
}
