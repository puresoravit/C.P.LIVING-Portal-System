"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { dateRangesOverlap } from "@/lib/pricing";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

function excelDateToJs(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

export async function validatePriceImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "price.edit")) throw new Error("FORBIDDEN");

  const [products, customers, branches, existingRules] = await Promise.all([
    db.product.findMany({ select: { id: true, sku: true } }),
    db.customer.findMany({ select: { id: true, code: true } }),
    db.branch.findMany({ select: { id: true, code: true, customerId: true } }),
    db.priceRule.findMany(),
  ]);
  const productBySku = new Map(products.map((p) => [p.sku, p.id]));
  const customerByCode = new Map(customers.map((c) => [c.code, c.id]));

  const batchRules: { productId: string; customerId: string; branchId: string | null; from: Date; to: Date | null }[] = [];

  return rows.map((raw, idx) => {
    const rowNum = idx + 2;
    const sku = String(raw.sku ?? "").trim();
    const customerCode = String(raw.customerCode ?? "").trim();
    const branchCode = raw.branchCode ? String(raw.branchCode).trim() : "";
    const price = Number(raw.price);
    const effectiveFrom = excelDateToJs(raw.effectiveFrom);
    const effectiveTo = raw.effectiveTo ? excelDateToJs(raw.effectiveTo) : null;

    if (!sku) return { row: rowNum, valid: false, error: "ไม่มี SKU" };
    const productId = productBySku.get(sku);
    if (!productId) return { row: rowNum, valid: false, error: `ไม่พบสินค้า SKU "${sku}"` };
    if (!customerCode) return { row: rowNum, valid: false, error: "ไม่มีรหัสลูกค้า (customerCode)" };
    const customerId = customerByCode.get(customerCode);
    if (!customerId) return { row: rowNum, valid: false, error: `ไม่พบลูกค้ารหัส "${customerCode}"` };

    let branchId: string | null = null;
    if (branchCode) {
      const branch = branches.find((b) => b.code === branchCode && b.customerId === customerId);
      if (!branch) return { row: rowNum, valid: false, error: `ไม่พบสาขารหัส "${branchCode}" ของลูกค้ารายนี้` };
      branchId = branch.id;
    }

    if (isNaN(price) || price < 0) return { row: rowNum, valid: false, error: `ราคา "${raw.price}" ไม่ถูกต้อง` };
    if (!effectiveFrom) return { row: rowNum, valid: false, error: `วันที่มีผล "${raw.effectiveFrom}" ไม่ถูกต้อง` };

    // เช็ค overlap กับที่มีอยู่แล้วในระบบ + ที่กำลังจะ import พร้อมกันในไฟล์นี้ (ข้อ 61)
    const sameScope = existingRules.filter((r) => r.productId === productId && r.customerId === customerId && r.branchId === branchId);
    const overlapExisting = sameScope.some((r) => dateRangesOverlap(effectiveFrom, effectiveTo, r.effectiveFrom, r.effectiveTo));
    if (overlapExisting) return { row: rowNum, valid: false, error: "ช่วงวันที่มีผลซ้อนกับราคาที่มีอยู่แล้วในระบบ" };

    const overlapBatch = batchRules.some(
      (r) => r.productId === productId && r.customerId === customerId && r.branchId === branchId && dateRangesOverlap(effectiveFrom, effectiveTo, r.from, r.to)
    );
    if (overlapBatch) return { row: rowNum, valid: false, error: "ช่วงวันที่มีผลซ้อนกับแถวอื่นในไฟล์เดียวกัน" };

    batchRules.push({ productId, customerId, branchId, from: effectiveFrom, to: effectiveTo });

    return {
      row: rowNum,
      valid: true,
      data: { sku, customerCode, branchCode, productId, customerId, branchId, price, effectiveFrom: effectiveFrom.toISOString(), effectiveTo: effectiveTo?.toISOString() },
    };
  });
}

export async function commitPriceImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "price.edit")) throw new Error("FORBIDDEN");

  let imported = 0;
  for (const row of rows) {
    const rule = await db.priceRule.create({
      data: {
        productId: row.productId,
        customerId: row.customerId,
        branchId: row.branchId,
        price: row.price,
        effectiveFrom: new Date(row.effectiveFrom),
        effectiveTo: row.effectiveTo ? new Date(row.effectiveTo) : null,
      },
    });
    await db.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "Price", recordId: rule.id, newValue: { ...row, source: "ExcelImport" } },
    });
    imported++;
  }

  revalidatePath("/prices");
  return { imported };
}
