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

export async function validateDiscountImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "discount.edit")) throw new Error("FORBIDDEN");

  const [customers, branches, productTypes, existingRules] = await Promise.all([
    db.customer.findMany({ select: { id: true, code: true } }),
    db.branch.findMany({ select: { id: true, code: true, customerId: true } }),
    db.productType.findMany({ select: { id: true, code: true } }),
    db.discountRule.findMany(),
  ]);
  const customerByCode = new Map(customers.map((c) => [c.code, c.id]));
  const typeByCode = new Map(productTypes.map((t) => [t.code, t.id]));

  const batchRules: { customerId: string; branchId: string | null; productTypeId: string; from: Date; to: Date | null }[] = [];

  return rows.map((raw, idx) => {
    const rowNum = idx + 2;
    const customerCode = String(raw.customerCode ?? "").trim();
    const branchCode = raw.branchCode ? String(raw.branchCode).trim() : "";
    const productTypeCode = String(raw.productTypeCode ?? "").trim();
    const discountPct = Number(raw.discountPct);
    const effectiveFrom = excelDateToJs(raw.effectiveFrom);
    const effectiveTo = raw.effectiveTo ? excelDateToJs(raw.effectiveTo) : null;

    if (!customerCode) return { row: rowNum, valid: false, error: "ไม่มีรหัสลูกค้า (customerCode)" };
    const customerId = customerByCode.get(customerCode);
    if (!customerId) return { row: rowNum, valid: false, error: `ไม่พบลูกค้ารหัส "${customerCode}"` };

    let branchId: string | null = null;
    if (branchCode) {
      const branch = branches.find((b) => b.code === branchCode && b.customerId === customerId);
      if (!branch) return { row: rowNum, valid: false, error: `ไม่พบสาขารหัส "${branchCode}" ของลูกค้ารายนี้` };
      branchId = branch.id;
    }

    if (!productTypeCode) return { row: rowNum, valid: false, error: "ไม่มีรหัสประเภทสินค้า (productTypeCode)" };
    const productTypeId = typeByCode.get(productTypeCode);
    if (!productTypeId) return { row: rowNum, valid: false, error: `ไม่พบประเภทสินค้ารหัส "${productTypeCode}"` };

    if (isNaN(discountPct) || discountPct < 0 || discountPct > 100) return { row: rowNum, valid: false, error: `ส่วนลด "${raw.discountPct}" ไม่ถูกต้อง (ต้อง 0-100)` };
    if (!effectiveFrom) return { row: rowNum, valid: false, error: `วันที่มีผล "${raw.effectiveFrom}" ไม่ถูกต้อง` };

    const sameScope = existingRules.filter((r) => r.customerId === customerId && r.branchId === branchId && r.productTypeId === productTypeId);
    const overlapExisting = sameScope.some((r) => dateRangesOverlap(effectiveFrom, effectiveTo, r.effectiveFrom, r.effectiveTo));
    if (overlapExisting) return { row: rowNum, valid: false, error: "ช่วงวันที่มีผลซ้อนกับส่วนลดที่มีอยู่แล้วในระบบ" };

    const overlapBatch = batchRules.some(
      (r) => r.customerId === customerId && r.branchId === branchId && r.productTypeId === productTypeId && dateRangesOverlap(effectiveFrom, effectiveTo, r.from, r.to)
    );
    if (overlapBatch) return { row: rowNum, valid: false, error: "ช่วงวันที่มีผลซ้อนกับแถวอื่นในไฟล์เดียวกัน" };

    batchRules.push({ customerId, branchId, productTypeId, from: effectiveFrom, to: effectiveTo });

    return {
      row: rowNum,
      valid: true,
      data: {
        customerCode,
        branchCode,
        productTypeCode,
        customerId,
        branchId,
        productTypeId,
        discountPct,
        effectiveFrom: effectiveFrom.toISOString(),
        effectiveTo: effectiveTo?.toISOString(),
      },
    };
  });
}

export async function commitDiscountImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "discount.edit")) throw new Error("FORBIDDEN");

  let imported = 0;
  for (const row of rows) {
    const rule = await db.discountRule.create({
      data: {
        customerId: row.customerId,
        branchId: row.branchId,
        productTypeId: row.productTypeId,
        discountPct: row.discountPct,
        effectiveFrom: new Date(row.effectiveFrom),
        effectiveTo: row.effectiveTo ? new Date(row.effectiveTo) : null,
      },
    });
    await db.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "Discount", recordId: rule.id, newValue: { ...row, source: "ExcelImport" } },
    });
    imported++;
  }

  revalidatePath("/discounts");
  return { imported };
}
