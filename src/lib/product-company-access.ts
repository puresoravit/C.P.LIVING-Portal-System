import { db } from "@/lib/db";

// ==========================================================================
// R8 (2026-08-26) — Product Assignment ตามบริษัทลูกค้า
// Semantics เต็มดูที่ Comment ของ model ProductCompanyAccess ใน schema.prisma —
// สรุปสั้น: Allowlist ระดับ "Family Head" / ไม่มีแถวเลย = สินค้าส่วนกลางทุกบริษัทใช้ได้
// ไฟล์นี้เป็นจุดเดียวของ Logic ตัดสินสิทธิ์ ห้ามกระจาย Query เงื่อนไขนี้ไปเขียนเองที่อื่น
// ==========================================================================

/** Prisma where Fragment สำหรับกรอง "Family Head" (Product Anchor/Standalone หรือ
 * ProductModel — ทั้งคู่มี Relation ชื่อ companyAccess เหมือนกัน) ให้เหลือเฉพาะที่บริษัท
 * customerId ใช้ได้: ไม่มีแถวสิทธิ์เลย (ส่วนกลาง) หรือมีแถวของบริษัทนี้ */
export function companyAccessWhere(customerId: string): {
  OR: ({ companyAccess: { none: Record<string, never> } } | { companyAccess: { some: { customerId: string } } })[];
} {
  return {
    OR: [{ companyAccess: { none: {} } }, { companyAccess: { some: { customerId } } }],
  };
}

/** Pure Function — หาว่า Product แถวนี้ใช้สิทธิ์จาก Head ตัวไหน (Unit Test ตรงๆ ได้):
 *  - Variant ของ Product Anchor (parentProductId) → Head คือ Anchor (product)
 *  - Variant ของ ProductModel (modelId, ไม่มี parent) → Head คือ Model
 *  - นอกนั้น (Standalone/Anchor เอง) → Head คือตัวเอง (product) */
export function resolveAccessHead(product: {
  id: string;
  parentProductId: string | null;
  modelId: string | null;
}): { kind: "product"; id: string } | { kind: "model"; id: string } {
  if (product.parentProductId) return { kind: "product", id: product.parentProductId };
  if (product.modelId) return { kind: "model", id: product.modelId };
  return { kind: "product", id: product.id };
}

/** Pure Function — ตัดสินสิทธิ์จากรายชื่อบริษัทที่มีแถว Allowlist ของ Head นั้น:
 * ว่างเปล่า = ส่วนกลาง (ทุกบริษัทใช้ได้เสมอ) */
export function isAllowedByAccessList(accessCustomerIds: string[], customerId: string): boolean {
  return accessCustomerIds.length === 0 || accessCustomerIds.includes(customerId);
}

/** Server Validation (Defense-in-depth หลัง UI กรองแล้วชั้นหนึ่ง) — ใช้ในทุก Action ที่
 * "เพิ่มรายการสินค้าเข้าเอกสาร" — คืน null เมื่อผ่าน / ข้อความ Error ภาษาไทยเมื่อไม่ผ่าน
 * (Product ไม่พบก็ไม่ผ่าน — ให้ Action เดิมจัดการต่อเองตาม Flow ปกติของมัน) */
export async function validateProductAllowedForCustomer(
  productId: string,
  customerId: string
): Promise<string | null> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, parentProductId: true, modelId: true },
  });
  if (!product) return "ไม่พบสินค้าที่เลือก";

  const head = resolveAccessHead(product);
  const rows = await db.productCompanyAccess.findMany({
    where: head.kind === "product" ? { productId: head.id } : { productModelId: head.id },
    select: { customerId: true },
  });
  if (isAllowedByAccessList(rows.map((r) => r.customerId), customerId)) return null;
  return `สินค้า "${product.name}" ไม่ได้เปิดให้บริษัทลูกค้ารายนี้ใช้งาน — ตรวจสอบการกำหนดบริษัทที่หน้าสินค้า หรือเลือกสินค้าอื่น`;
}

/** ตั้งชุดบริษัทของ Family Head ให้ตรงกับ desiredCustomerIds (Server คำนวณ Diff จาก
 * สถานะจริงใน DB — สร้างส่วนที่ขาด/ลบส่วนที่เกิน — Atomic ทั้งชุด + AuditLog ครบ) —
 * Pattern เดียวกับ updateUserAppAccess ของ Access Management ทุกประการ — ล้างจนว่าง =
 * กลับเป็นสินค้าส่วนกลาง (ทุกบริษัทใช้ได้) ไม่ใช่การปิดการมองเห็น */
export async function setCompanyAccessForHead(params: {
  head: { kind: "product"; id: string } | { kind: "model"; id: string };
  desiredCustomerIds: string[];
  actorUserId: string;
}): Promise<{ granted: number; revoked: number }> {
  const { head, actorUserId } = params;
  const headWhere = head.kind === "product" ? { productId: head.id } : { productModelId: head.id };

  // กรองเฉพาะบริษัทที่มีอยู่จริง (Defense-in-depth — id ปลอมจาก Client ถูกทิ้งเงียบๆ)
  const validCustomers = await db.customer.findMany({
    where: { id: { in: params.desiredCustomerIds } },
    select: { id: true, companyName: true },
  });
  const desired = new Set(validCustomers.map((c) => c.id));

  const currentRows = await db.productCompanyAccess.findMany({ where: headWhere, select: { customerId: true } });
  const current = new Set(currentRows.map((r) => r.customerId));

  const toGrant = [...desired].filter((id) => !current.has(id));
  const toRevoke = [...current].filter((id) => !desired.has(id));
  if (toGrant.length === 0 && toRevoke.length === 0) return { granted: 0, revoked: 0 };

  await db.$transaction(async (tx) => {
    for (const customerId of toGrant) {
      await tx.productCompanyAccess.create({ data: { ...headWhere, customerId, grantedById: actorUserId } });
    }
    if (toRevoke.length > 0) {
      await tx.productCompanyAccess.deleteMany({ where: { ...headWhere, customerId: { in: toRevoke } } });
    }
    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: "SET_PRODUCT_COMPANY_ACCESS",
        module: head.kind === "product" ? "Product" : "ProductModel",
        recordId: head.id,
        newValue: {
          granted: toGrant,
          revoked: toRevoke,
          resultCustomerIds: [...desired],
          sharedToAll: desired.size === 0,
        },
      },
    });
  });

  return { granted: toGrant.length, revoked: toRevoke.length };
}
