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
    // R4 — productTypeCode ว่างได้แล้ว (= ไม่ระบุประเภท) แต่ถ้ากรอกมาต้องมีจริงใน Master
    // เท่านั้น (กัน Typo เงียบๆ กลายเป็น "ไม่ระบุประเภท" โดยไม่ตั้งใจ)
    let productTypeId: string | undefined;
    if (productTypeCode) {
      productTypeId = typeByCode.get(productTypeCode);
      if (!productTypeId) return { row: rowNum, valid: false, error: `ไม่พบประเภทสินค้ารหัส "${productTypeCode}"` };
    }
    if (!unit) return { row: rowNum, valid: false, error: "ไม่มีหน่วย (unit)" };
    if (isNaN(standardPrice) || standardPrice < 0) return { row: rowNum, valid: false, error: `ราคา "${raw.standardPrice}" ไม่ถูกต้อง` };
    // R4 — Model ต้องผูกกับ ProductType เสมอ (ProductModel.productTypeId ยัง required) —
    // แถวที่ระบุ modelName แต่ productTypeCode ว่างจึงไม่สมเหตุสมผล ต้อง Error ชัดเจน
    // แทนที่จะเดา/ปล่อยผ่านเงียบๆ
    if (raw.modelName && !productTypeId) {
      return { row: rowNum, valid: false, error: "ระบุรุ่นสินค้า (modelName) ได้ก็ต่อเมื่อมีรหัสประเภทสินค้า (productTypeCode) เท่านั้น" };
    }

    seenInBatch.add(sku);
    return {
      row: rowNum,
      valid: true,
      data: {
        sku,
        name,
        productTypeCode, // แสดง preview เท่านั้น
        productTypeId,
        // modelName เป็น optional — ถ้ากรอกมาจะ find-or-create ProductModel ให้ตอน
        // commit (ไม่ auto-derive จากชื่อสินค้าใดๆ ผู้ใช้พิมพ์ระบุเองตรงๆ ในไฟล์)
        // เว้นว่าง = Product เข้าคิว "ยังไม่ระบุรุ่นสินค้า" ให้ backfill ทีหลังในหน้า /products
        modelName: raw.modelName ? String(raw.modelName).trim() : undefined,
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
    const { productTypeCode, modelName, ...data } = row;

    let modelId: string | undefined;
    if (modelName) {
      const existingModel = await db.productModel.findFirst({
        where: { productTypeId: data.productTypeId, name: modelName },
      });
      modelId = existingModel
        ? existingModel.id
        : (await db.productModel.create({ data: { productTypeId: data.productTypeId, name: modelName } })).id;
    }

    const product = await db.product.create({ data: { ...data, modelId } });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        module: "Product",
        recordId: product.id,
        newValue: { ...data, modelName, modelId, source: "ExcelImport" },
      },
    });
    imported++;
  }

  revalidatePath("/products");
  revalidatePath("/product-models");
  return { imported };
}
