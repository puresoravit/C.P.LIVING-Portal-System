import { db } from "@/lib/db";

// ==========================================================================
// R8 (2026-08-26) — Product Assignment ตามบริษัทลูกค้า
// Semantics เต็มดูที่ Comment ของ model ProductCompanyAccess ใน schema.prisma —
// สรุปสั้น: Allowlist ระดับ "Family Head" / ไม่มีแถวเลย = สินค้าส่วนกลางทุกบริษัทใช้ได้
// ไฟล์นี้เป็นจุดเดียวของ Logic ตัดสินสิทธิ์ ห้ามกระจาย Query เงื่อนไขนี้ไปเขียนเองที่อื่น
// ==========================================================================

/** Prisma where Fragment สำหรับกรอง "Family Head" (Product Anchor/Standalone หรือ
 * ProductModel — ทั้งคู่มี Relation ชื่อ catalog + companyAccess เหมือนกัน) ให้เหลือ
 * เฉพาะที่บริษัท customerId ใช้ได้ — R9 ลำดับการตัดสิน:
 *   1. Head อยู่ใน Catalog → เห็นเฉพาะบริษัทสมาชิก Catalog นั้น
 *   2. Head ไม่มี Catalog (สินค้าส่วนกลาง) → กฎเดิม: ไม่มีแถว ProductCompanyAccess เลย =
 *      ทุกบริษัทเห็น / มีแถว = เฉพาะบริษัทที่มีแถว (Compatibility ของกลไก R8 เดิม) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function companyAccessWhere(customerId: string): any {
  return {
    OR: [
      { catalog: { companies: { some: { customerId } } } },
      {
        AND: [
          { catalogId: null },
          { OR: [{ companyAccess: { none: {} } }, { companyAccess: { some: { customerId } } }] },
        ],
      },
    ],
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

/** Pure Function (R9) — ตัดสินสิทธิ์รวม Catalog + Legacy Allowlist ของ Head เดียว:
 * catalogCompanyIds = null → Head ไม่มี Catalog → ใช้กฎ Legacy (isAllowedByAccessList)
 * catalogCompanyIds = รายชื่อสมาชิก → เห็นเฉพาะสมาชิก Catalog เท่านั้น (Allowlist เดิมไม่
 * เกี่ยวอีกต่อไปสำหรับ Head ที่ย้ายเข้า Catalog แล้ว — Catalog คือคำตอบเดียว) */
export function isVisibleToCompany(params: {
  catalogCompanyIds: string[] | null;
  accessCustomerIds: string[];
  customerId: string;
}): boolean {
  if (params.catalogCompanyIds !== null) return params.catalogCompanyIds.includes(params.customerId);
  return isAllowedByAccessList(params.accessCustomerIds, params.customerId);
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
  // R9 — โหลด catalogId ของ Head + สมาชิก Catalog (ถ้ามี) + แถว Allowlist เดิม แล้วตัดสิน
  // ด้วย isVisibleToCompany (Logic เดียวกับ companyAccessWhere ที่ใช้กรองผลค้นหาเป๊ะ)
  const headRecord =
    head.kind === "product"
      ? await db.product.findUnique({ where: { id: head.id }, select: { catalogId: true } })
      : await db.productModel.findUnique({ where: { id: head.id }, select: { catalogId: true } });
  const catalogCompanyIds = headRecord?.catalogId
    ? (
        await db.productCatalogCompany.findMany({
          where: { catalogId: headRecord.catalogId },
          select: { customerId: true },
        })
      ).map((r) => r.customerId)
    : null;
  const rows = await db.productCompanyAccess.findMany({
    where: head.kind === "product" ? { productId: head.id } : { productModelId: head.id },
    select: { customerId: true },
  });
  if (isVisibleToCompany({ catalogCompanyIds, accessCustomerIds: rows.map((r) => r.customerId), customerId }))
    return null;
  return `สินค้า "${product.name}" ไม่ได้เปิดให้บริษัทลูกค้ารายนี้ใช้งาน — ตรวจสอบ Catalog/การกำหนดบริษัทที่หน้าสินค้า หรือเลือกสินค้าอื่น`;
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

// ---------------------------------------------------------------------------
// R9 — Company Catalog Helpers (Server-side เท่านั้น — Caller คือ Server Action ที่
// เช็คสิทธิ์ product.edit แล้วเสมอ)
// ---------------------------------------------------------------------------

/** หา Catalog ของบริษัท — ถ้ายังไม่มี สร้างใหม่ให้อัตโนมัติ (ตั้งชื่อตามบริษัท) พร้อม
 * สมาชิกแถวแรกคือบริษัทนั้นเอง — Idempotent: เรียกซ้ำได้ผล Catalog เดิมเสมอ */
export async function ensureCompanyCatalog(customerId: string, actorUserId: string): Promise<{ id: string; name: string }> {
  const existing = await db.productCatalogCompany.findUnique({
    where: { customerId },
    select: { catalog: { select: { id: true, name: true } } },
  });
  if (existing) return existing.catalog;

  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { companyName: true } });
  return db.$transaction(async (tx) => {
    const catalog = await tx.productCatalog.create({ data: { name: `Catalog — ${customer.companyName}` } });
    await tx.productCatalogCompany.create({ data: { catalogId: catalog.id, customerId, addedById: actorUserId } });
    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: "CREATE_PRODUCT_CATALOG",
        module: "ProductCatalog",
        recordId: catalog.id,
        newValue: { name: catalog.name, firstCompanyId: customerId },
      },
    });
    return { id: catalog.id, name: catalog.name };
  });
}

/** เพิ่มบริษัทเข้า Catalog — บริษัทที่อยู่ Catalog อื่นอยู่แล้วต้องถอดออกจากที่เดิมก่อน
 * (1 บริษัท : 1 Catalog — คืน Error ข้อความไทยให้ UI แสดงตรงๆ) */
export async function addCompanyToCatalog(
  catalogId: string,
  customerId: string,
  actorUserId: string
): Promise<string | null> {
  const membership = await db.productCatalogCompany.findUnique({
    where: { customerId },
    select: { catalogId: true, catalog: { select: { name: true } } },
  });
  if (membership) {
    if (membership.catalogId === catalogId) return null; // อยู่แล้ว — Idempotent
    return `บริษัทนี้อยู่ใน "${membership.catalog.name}" อยู่แล้ว — ถอดออกจากกลุ่มเดิมก่อนจึงย้ายมากลุ่มนี้ได้ (1 บริษัทอยู่ได้ 1 กลุ่ม)`;
  }
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { companyName: true } });
  if (!customer) return "ไม่พบบริษัทลูกค้า";
  await db.$transaction([
    db.productCatalogCompany.create({ data: { catalogId, customerId, addedById: actorUserId } }),
    db.auditLog.create({
      data: {
        userId: actorUserId,
        action: "ADD_CATALOG_COMPANY",
        module: "ProductCatalog",
        recordId: catalogId,
        newValue: { customerId, companyName: customer.companyName },
      },
    }),
  ]);
  return null;
}

/** R9.1 — Drag & Drop รวมกลุ่ม: ย้าย/รวมบริษัท dragged เข้ากลุ่มของบริษัท target —
 * ครอบคลุมทุกเคสใน Transaction เดียว (ตัดสินจากสถานะจริงใน DB ไม่เชื่อ Client):
 *   1. dragged ยังไม่มีกลุ่ม → เข้ากลุ่มของ target (สร้างกลุ่มให้ target ถ้ายังไม่มี)
 *   2. อยู่กลุ่มเดียวกันแล้ว → No-op
 *   3. dragged อยู่กลุ่มเดิมคนเดียว → "รวมกลุ่ม": ย้ายสินค้า/รุ่นทุกหัวรายการของกลุ่มเดิม
 *      ตามมาด้วย (Re-point catalogId — ไม่มีการสร้าง/ลบ/Duplicate สินค้าใดๆ) แล้วลบกลุ่ม
 *      เปล่าทิ้ง — สองกลุ่มมีสินค้าทั้งคู่ก็แค่รวมเป็นรายการเดียว (SKU Unique ทั้งระบบ
 *      อยู่แล้ว ชนกันไม่ได้) — จำนวนแจ้งกลับใน summary ให้ผู้ใช้เห็นชัด
 *   4. dragged อยู่กลุ่มเดิมกับบริษัทอื่น → ย้ายเฉพาะบริษัท (สินค้าอยู่กับกลุ่มเดิม/สมาชิก
 *      ที่เหลือ — Conflict ที่ต้องแจ้ง: บริษัทที่ย้ายจะไม่เห็นสินค้ากลุ่มเดิมอีก)
 * ไม่แตะ Pricing/Discount/Snapshot/เอกสารใดๆ ทั้งสิ้น */
export async function moveCompanyIntoGroup(params: {
  draggedCustomerId: string;
  targetCustomerId: string;
  actorUserId: string;
}): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const { draggedCustomerId, targetCustomerId, actorUserId } = params;
  if (draggedCustomerId === targetCustomerId) return { ok: false, error: "ลากมาทับบริษัทเดียวกันเอง — ไม่มีอะไรต้องทำ" };

  const [dragged, target] = await Promise.all([
    db.customer.findUnique({ where: { id: draggedCustomerId }, select: { id: true, companyName: true } }),
    db.customer.findUnique({ where: { id: targetCustomerId }, select: { id: true, companyName: true } }),
  ]);
  if (!dragged || !target) return { ok: false, error: "ไม่พบบริษัทที่เลือก" };

  const targetCatalog = await ensureCompanyCatalog(targetCustomerId, actorUserId);
  const membership = await db.productCatalogCompany.findUnique({
    where: { customerId: draggedCustomerId },
    select: { catalogId: true, catalog: { select: { name: true } } },
  });

  if (!membership) {
    await db.$transaction([
      db.productCatalogCompany.create({ data: { catalogId: targetCatalog.id, customerId: draggedCustomerId, addedById: actorUserId } }),
      db.auditLog.create({
        data: {
          userId: actorUserId,
          action: "ADD_CATALOG_COMPANY",
          module: "ProductCatalog",
          recordId: targetCatalog.id,
          newValue: { customerId: draggedCustomerId, companyName: dragged.companyName, via: "dragMerge" },
        },
      }),
    ]);
    return { ok: true, summary: `เพิ่ม "${dragged.companyName}" เข้ากลุ่มของ "${target.companyName}" แล้ว — เห็นสินค้าชุดเดียวกันทันที` };
  }

  if (membership.catalogId === targetCatalog.id) {
    return { ok: true, summary: `"${dragged.companyName}" อยู่กลุ่มเดียวกับ "${target.companyName}" อยู่แล้ว` };
  }

  const oldCatalogId = membership.catalogId;
  const [otherMembers, oldHeadProducts, oldHeadModels, targetHeadProducts, targetHeadModels] = await Promise.all([
    db.productCatalogCompany.count({ where: { catalogId: oldCatalogId, customerId: { not: draggedCustomerId } } }),
    db.product.count({ where: { catalogId: oldCatalogId } }),
    db.productModel.count({ where: { catalogId: oldCatalogId } }),
    db.product.count({ where: { catalogId: targetCatalog.id } }),
    db.productModel.count({ where: { catalogId: targetCatalog.id } }),
  ]);
  const oldHeads = oldHeadProducts + oldHeadModels;

  if (otherMembers > 0) {
    // เคส 4 — ย้ายเฉพาะบริษัท: สินค้าอยู่กับกลุ่มเดิม
    await db.$transaction([
      db.productCatalogCompany.update({ where: { customerId: draggedCustomerId }, data: { catalogId: targetCatalog.id, addedById: actorUserId } }),
      db.auditLog.create({
        data: {
          userId: actorUserId,
          action: "MOVE_CATALOG_COMPANY",
          module: "ProductCatalog",
          recordId: targetCatalog.id,
          newValue: { customerId: draggedCustomerId, from: oldCatalogId, productsStayedBehind: oldHeads },
        },
      }),
    ]);
    return {
      ok: true,
      summary: `ย้าย "${dragged.companyName}" มากลุ่มของ "${target.companyName}" แล้ว — สินค้า ${oldHeads} รายการของกลุ่มเดิมยังอยู่กับสมาชิกที่เหลือ (บริษัทที่ย้ายจะไม่เห็นรายการเหล่านั้นอีก)`,
    };
  }

  // เคส 3 — รวมกลุ่ม: บริษัทเดียว + สินค้าทั้งกลุ่มตามมาด้วย แล้วลบกลุ่มเปล่า
  await db.$transaction([
    db.product.updateMany({ where: { catalogId: oldCatalogId }, data: { catalogId: targetCatalog.id } }),
    db.productModel.updateMany({ where: { catalogId: oldCatalogId }, data: { catalogId: targetCatalog.id } }),
    db.productCatalogCompany.update({ where: { customerId: draggedCustomerId }, data: { catalogId: targetCatalog.id, addedById: actorUserId } }),
    db.productCatalog.delete({ where: { id: oldCatalogId } }),
    db.auditLog.create({
      data: {
        userId: actorUserId,
        action: "MERGE_CATALOG",
        module: "ProductCatalog",
        recordId: targetCatalog.id,
        newValue: {
          mergedCustomerId: draggedCustomerId,
          fromCatalog: oldCatalogId,
          movedHeadCount: oldHeads,
          targetHadHeadCount: targetHeadProducts + targetHeadModels,
        },
      },
    }),
  ]);
  const targetHeads = targetHeadProducts + targetHeadModels;
  return {
    ok: true,
    summary:
      oldHeads > 0
        ? `รวมกลุ่มแล้ว — สินค้า ${oldHeads} รายการของ "${dragged.companyName}" มารวมกับของกลุ่ม "${target.companyName}"${targetHeads > 0 ? ` (${targetHeads} รายการ)` : ""} เป็นรายการเดียว ไม่มีสินค้าหาย/ซ้ำ`
        : `ย้าย "${dragged.companyName}" มากลุ่มของ "${target.companyName}" แล้ว`,
  };
}

/** ถอดบริษัทออกจาก Catalog — สินค้าใน Catalog ไม่ถูกแตะเลย (บริษัทที่ถูกถอดแค่มองไม่เห็น
 * ตอนสร้างเอกสารใหม่ — เอกสารเก่า/Snapshot ไม่กระทบตามหลักการเดิม) */
export async function removeCompanyFromCatalog(
  catalogId: string,
  customerId: string,
  actorUserId: string
): Promise<string | null> {
  const membership = await db.productCatalogCompany.findUnique({ where: { customerId }, select: { catalogId: true } });
  if (!membership || membership.catalogId !== catalogId) return "บริษัทนี้ไม่ได้อยู่ในกลุ่มนี้";
  await db.$transaction([
    db.productCatalogCompany.delete({ where: { customerId } }),
    db.auditLog.create({
      data: {
        userId: actorUserId,
        action: "REMOVE_CATALOG_COMPANY",
        module: "ProductCatalog",
        recordId: catalogId,
        newValue: { customerId },
      },
    }),
  ]);
  return null;
}
