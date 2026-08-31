// Production Module (P1) — ตระกูลสินค้า (Product Family) reuse ProductModel/Product
// เดิมจาก Billing (ไม่สร้าง ProductFamily ใหม่ — ดู docs/production-module/
// 02-P1-schema-decisions.md) ไฟล์นี้รวม pure function ที่ไม่แตะ DB เพื่อให้ทดสอบตรงๆ ได้
// ตาม Pattern เดียวกับ resolveAccessHead() ใน product-company-access.ts

export type AliasFamilyHead =
  | { kind: "model"; id: string }
  | { kind: "product"; id: string };

/**
 * ProductAlias.productModelId/productId เป็น XOR (Family Head Pattern เดียวกับ
 * ProductCompanyAccess) — คืนค่า head ถ้าถูกต้อง (เลือกมาแค่หนึ่งอย่าง) หรือ null ถ้าผิด
 * (เลือกทั้งคู่ หรือไม่เลือกเลย)
 */
export function resolveAliasFamilyHead(input: {
  productModelId?: string | null;
  productId?: string | null;
}): AliasFamilyHead | null {
  const hasModel = !!input.productModelId;
  const hasProduct = !!input.productId;
  if (hasModel === hasProduct) return null; // ทั้งคู่ / ไม่มีเลย = ผิด
  return hasModel ? { kind: "model", id: input.productModelId as string } : { kind: "product", id: input.productId as string };
}

/**
 * Normalize ข้อความ alias สำหรับค้นหา/กันซ้ำ — lowercase + ตัด whitespace ซ้ำ/หัวท้าย
 * (ไม่ตัดวรรณยุกต์/สระไทยออก เพราะ "เดวิท" กับ "เดวิด" ต้องแยกกันได้ ต่างจากการเทียบแบบ fuzzy)
 */
export function normalizeAliasText(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export type AliasScopeValue = "GLOBAL" | "CUSTOMER" | "BRANCH";

/**
 * ตรวจว่า scope กับ customerId/branchId ที่กรอกมาสอดคล้องกันไหม
 * GLOBAL: ต้องไม่มีทั้งคู่ · CUSTOMER: ต้องมี customerId ไม่มี branchId · BRANCH: ต้องมีทั้งคู่
 */
export function validateAliasScope(input: {
  scope: AliasScopeValue;
  customerId?: string | null;
  branchId?: string | null;
}): string | null {
  const hasCustomer = !!input.customerId;
  const hasBranch = !!input.branchId;
  if (input.scope === "GLOBAL" && (hasCustomer || hasBranch)) {
    return "ขอบเขต GLOBAL ต้องไม่ระบุลูกค้า/สาขา";
  }
  if (input.scope === "CUSTOMER" && (!hasCustomer || hasBranch)) {
    return "ขอบเขต CUSTOMER ต้องระบุลูกค้า และห้ามระบุสาขา";
  }
  if (input.scope === "BRANCH" && (!hasCustomer || !hasBranch)) {
    return "ขอบเขต BRANCH ต้องระบุทั้งลูกค้าและสาขา";
  }
  return null;
}
