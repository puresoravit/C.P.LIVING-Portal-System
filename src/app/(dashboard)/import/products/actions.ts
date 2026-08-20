"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function validateProductImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const [productTypes, existingProducts] = await Promise.all([
    db.productType.findMany({ select: { id: true, code: true } }),
    db.product.findMany({ select: { sku: true } }),
  ]);
  const typeByCode = new Map(productTypes.map((t) => [t.code, t.id]));
  const existingSkus = new Set(existingProducts.map((p) => p.sku));
  const seenInBatch = new Set<string>();

  return rows.map((raw, idx) => {
    const rowNum = idx + 2;
    const sku = String(raw.sku ?? "").trim();
    const name = String(raw.name ?? "").trim();
    const productTypeCode = String(raw.productTypeCode ?? "").trim();
    const unit = String(raw.unit ?? "").trim();
    const standardPrice = Number(raw.standardPrice);

    if (!sku) return { row: rowNum, valid: false, error: "ไม่มี SKU" };
    if (existingSkus.has(sku)) return { row: rowNum, valid: false, error: `SKU "${sku}" ซ้ำกับที่มีอยู่แล้วในระบบ` };
    if (seenInBatch.has(sku)) return { row: rowNum, valid: false, error: `SKU "${sku}" ซ้ำกันเองในไฟล์` };
    if (!name) return { row: rowNum, valid: false, error: "ไม่มีชื่อสินค้า (name)" };
    if (!productTypeCode) return { row: rowNum, valid: false, error: "ไม่มีรหัสประเภทสินค้า (productTypeCode)" };
    const productTypeId = typeByCode.get(productTypeCode);
    if (!productTypeId) return { row: rowNum, valid: false, error: `ไม่พบประเภทสินค้ารหัส "${productTypeCode}"` };
    if (!unit) return { row: rowNum, valid: false, error: "ไม่มีหน่วย (unit)" };
    if (isNaN(standardPrice) || standardPrice < 0) return { row: rowNum, valid: false, error: `ราคา "${raw.standardPrice}" ไม่ถูกต้อง` };

    seenInBatch.add(sku);
    return {
      row: rowNum,
      valid: true,
      data: {
        sku,
        name,
        productTypeCode, // แสดง preview เท่านั้น
        productTypeId,
        size: raw.size ? String(raw.size) : undefined,
        unit,
        standardPrice,
        description: raw.description ? String(raw.description) : undefined,
      },
    };
  });
}

export async function commitProductImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  let imported = 0;
  for (const row of rows) {
    const { productTypeCode, ...data } = row;
    const product = await db.product.create({ data });
    await db.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "Product", recordId: product.id, newValue: { ...data, source: "ExcelImport" } },
    });
    imported++;
  }

  revalidatePath("/products");
  return { imported };
}
