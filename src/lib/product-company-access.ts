import { db } from "@/lib/db";

// ==========================================================================
// R8 (2026-08-26) — Product Assignment ตามบริษัทลูกค้า
// Semantics เต็มดูที่ Comment ของ model ProductCompanyAccess ใน schema.prisma —
// สรุปสั้น: Allowlist ระดับ "Family Head" / ไม่มีแถวเลย = สินค้าส่วนกลางทุกบริษัทใช้ได้
// ไฟล์นี้เป็นจุดเดียวของ Logic ตัดสินสิทธิ์ ห้ามกระจาย Query เงื่อนไขนี้ไปเขียนเองที่อื่น
// ==========================================================================

/** Prisma where Fragment สำหรับกรอง "Family Head" (Product Anchor/Standalone หรือ
 * ProductModel — ทั้งคู่มี Relation ชื่อ catalog + companyAccess + ownerCustomer เหมือน
 * กัน) ให้เหลือเฉพาะที่บริษัท customerId ใช้ได้ — R10 ลำดับการตัดสิน:
 *   1. Private ของบริษัทนี้ (ownerCustomerId ตรง) → เห็นเสมอ
 *   2. Head อยู่ใน Catalog (ที่ไม่ใช่ "สินค้าเสนอราคา") → เห็นเฉพาะบริษัทสมาชิกกลุ่ม
 *      (Catalog สินค้าเสนอราคาไม่มีสมาชิกเลยโดยเจตนา จึงไม่มีทางเข้าเงื่อนไขนี้อยู่แล้ว —
 *      เงื่อนไข isQuotationCatalog:false เป็น Defense-in-depth กันเผลอเพิ่มสมาชิกในอนาคต)
 *   3. Head ไม่มี Catalog/ไม่ Private (สินค้าส่วนกลาง) → กฎ R8 เดิม: ไม่มีแถว Allowlist =
 *      ทุกบริษัทเห็น / มีแถว = เฉพาะบริษัทที่มีแถว */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function companyAccessWhere(customerId: string): any {
  return {
    OR: [
      { ownerCustomerId: customerId },
      {
        AND: [
          { ownerCustomerId: null },
          { catalog: { isQuotationCatalog: false, companies: { some: { customerId } } } },
        ],
      },
      {
        AND: [
          { ownerCustomerId: null },
          { catalogId: null },
          { OR: [{ companyAccess: { none: {} } }, { companyAccess: { some: { customerId } } }] },
        ],
      },
    ],
  };
}

/** R10 — Fragment สำหรับ Scope "guest" (ใบเสนอราคาแบบกรอกข้อมูลเอง): เห็นเฉพาะ
 * "สินค้าเสนอราคา" (Catalog พิเศษ) + สินค้าส่วนกลางแท้ (ไม่มี Catalog/Private/Allowlist)
 * — ไม่มีทางเห็นสินค้าของกลุ่มบริษัทใดๆ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function quotationGuestWhere(): any {
  return {
    OR: [
      { catalog: { isQuotationCatalog: true } },
      {
        AND: [
          { ownerCustomerId: null },
          { catalogId: null },
          { companyAccess: { none: {} } },
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

/** Pure Function (R10) — ตัดสินสิทธิ์รวมของ Head เดียว ตามลำดับเดียวกับ
 * companyAccessWhere เป๊ะ: Private → Shared (สมาชิก Catalog — Catalog สินค้าเสนอราคาไม่
 * นับ) → Legacy (ส่วนกลาง/Allowlist) */
export function isVisibleToCompany(params: {
  /** ownerCustomerId ของ Head (null = ไม่ใช่ Private) */
  ownerCustomerId?: string | null;
  /** null = Head ไม่มี Catalog / Array = รายชื่อสมาชิกกลุ่ม */
  catalogCompanyIds: string[] | null;
  /** true = Catalog ของ Head คือ "สินค้าเสนอราคา" (Customer Master ไม่เห็นเสมอ) */
  isQuotationCatalog?: boolean;
  accessCustomerIds: string[];
  customerId: string;
}): boolean {
  const owner = params.ownerCustomerId ?? null;
  if (owner !== null) return owner === params.customerId;
  if (params.catalogCompanyIds !== null) {
    if (params.isQuotationCatalog) return false;
    return params.catalogCompanyIds.includes(params.customerId);
  }
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
  // R10 — โหลดสถานะ Head (Private/Catalog/Allowlist) แล้วตัดสินด้วย isVisibleToCompany
  // (Logic เดียวกับ companyAccessWhere ที่ใช้กรองผลค้นหาเป๊ะ)
  const headRecord =
    head.kind === "product"
      ? await db.product.findUnique({
          where: { id: head.id },
          select: { catalogId: true, ownerCustomerId: true, catalog: { select: { isQuotationCatalog: true } } },
        })
      : await db.productModel.findUnique({
          where: { id: head.id },
          select: { catalogId: true, ownerCustomerId: true, catalog: { select: { isQuotationCatalog: true } } },
        });
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
  if (
    isVisibleToCompany({
      ownerCustomerId: headRecord?.ownerCustomerId ?? null,
      catalogCompanyIds,
      isQuotationCatalog: headRecord?.catalog?.isQuotationCatalog ?? false,
      accessCustomerIds: rows.map((r) => r.customerId),
      customerId,
    })
  )
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

/** R10 — ย้ายบริษัทเข้า Catalog Group ปลายทาง (หรือ null = ออกจากกลุ่ม) — จุดเดียวของ
 * ทุกการย้ายสมาชิก (Drag & Drop บนบอร์ดกลุ่ม, ปุ่ม Fallback, การลากการ์ดบริษัททับกัน) —
 * Semantics ใหม่ตามแนวคิด Shared/Private:
 *   - การย้ายบริษัท "ไม่เปลี่ยนการมองเห็นของบริษัทอื่นเสมอ" (Invariant หลัก)
 *   - บริษัทเดิมอยู่กลุ่มเดี่ยว (สมาชิกคนเดียว) และกลุ่มนั้นมีสินค้า → สินค้าทั้งหมดแปลง
 *     เป็น Private ของบริษัทนั้น (มองเห็นเท่าเดิมเป๊ะ ไม่ Leak ให้กลุ่มใหม่/ไม่หาย) แล้วลบ
 *     กลุ่มเปล่าทิ้ง — อยากแชร์เข้ากลุ่มใหม่ค่อยย้ายเป็นรายตัว/ชุดผ่านเครื่องมือย้ายสินค้า
 *   - บริษัทอยู่กลุ่มหลายสมาชิก → ย้ายเฉพาะบริษัท (Shared เดิมอยู่กับกลุ่มเดิม) พร้อมแจ้ง
 *     Conflict ว่าจะไม่เห็น Shared เดิมอีก (Private ของบริษัทติดตัวไปเสมอ ไม่เกี่ยวกับกลุ่ม)
 * ไม่แตะ Pricing/Discount/Snapshot/เอกสารใดๆ ทั้งสิ้น */
export async function moveCompanyToCatalog(params: {
  customerId: string;
  targetCatalogId: string | null;
  actorUserId: string;
}): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const { customerId, targetCatalogId, actorUserId } = params;
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, companyName: true } });
  if (!customer) return { ok: false, error: "ไม่พบบริษัทที่เลือก" };

  const target = targetCatalogId
    ? await db.productCatalog.findUnique({ where: { id: targetCatalogId }, select: { id: true, name: true, isQuotationCatalog: true } })
    : null;
  if (targetCatalogId && !target) return { ok: false, error: "ไม่พบกลุ่มปลายทาง" };
  if (target?.isQuotationCatalog) return { ok: false, error: `"${target.name}" เป็นกลุ่มสินค้าเสนอราคา — เพิ่มบริษัทสมาชิกไม่ได้` };

  const membership = await db.productCatalogCompany.findUnique({
    where: { customerId },
    select: { catalogId: true, catalog: { select: { name: true } } },
  });

  if (!membership) {
    if (!target) return { ok: true, summary: `"${customer.companyName}" ไม่ได้อยู่กลุ่มใดอยู่แล้ว` };
    await db.$transaction([
      db.productCatalogCompany.create({ data: { catalogId: target.id, customerId, addedById: actorUserId } }),
      db.auditLog.create({
        data: {
          userId: actorUserId,
          action: "ADD_CATALOG_COMPANY",
          module: "ProductCatalog",
          recordId: target.id,
          newValue: { customerId, companyName: customer.companyName },
        },
      }),
    ]);
    return { ok: true, summary: `เพิ่ม "${customer.companyName}" เข้ากลุ่ม "${target.name}" แล้ว — เห็น Shared ของกลุ่มทันที` };
  }

  if (target && membership.catalogId === target.id) {
    return { ok: true, summary: `"${customer.companyName}" อยู่ในกลุ่ม "${target.name}" อยู่แล้ว` };
  }

  const oldCatalogId = membership.catalogId;
  const [otherMembers, oldHeadProducts, oldHeadModels] = await Promise.all([
    db.productCatalogCompany.count({ where: { catalogId: oldCatalogId, customerId: { not: customerId } } }),
    db.product.count({ where: { catalogId: oldCatalogId } }),
    db.productModel.count({ where: { catalogId: oldCatalogId } }),
  ]);
  const oldHeads = oldHeadProducts + oldHeadModels;
  const soloWithProducts = otherMembers === 0 && oldHeads > 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [];
  if (soloWithProducts) {
    // Shared ของกลุ่มเดี่ยวเดิม → Private ของบริษัท (มองเห็นเท่าเดิมเป๊ะ)
    ops.push(db.product.updateMany({ where: { catalogId: oldCatalogId }, data: { catalogId: null, ownerCustomerId: customerId } }));
    ops.push(db.productModel.updateMany({ where: { catalogId: oldCatalogId }, data: { catalogId: null, ownerCustomerId: customerId } }));
  }
  if (target) {
    ops.push(db.productCatalogCompany.update({ where: { customerId }, data: { catalogId: target.id, addedById: actorUserId } }));
  } else {
    ops.push(db.productCatalogCompany.delete({ where: { customerId } }));
  }
  if (otherMembers === 0) {
    ops.push(db.productCatalog.delete({ where: { id: oldCatalogId } }));
  }
  ops.push(
    db.auditLog.create({
      data: {
        userId: actorUserId,
        action: target ? "MOVE_CATALOG_COMPANY" : "REMOVE_CATALOG_COMPANY",
        module: "ProductCatalog",
        recordId: target?.id ?? oldCatalogId,
        newValue: {
          customerId,
          from: oldCatalogId,
          to: target?.id ?? null,
          convertedToPrivate: soloWithProducts ? oldHeads : 0,
          sharedStayedBehind: otherMembers > 0 ? oldHeads : 0,
        },
      },
    })
  );
  await db.$transaction(ops);

  if (soloWithProducts) {
    return {
      ok: true,
      summary: target
        ? `ย้าย "${customer.companyName}" เข้ากลุ่ม "${target.name}" แล้ว — สินค้าเดิม ${oldHeads} รายการกลายเป็น Private ของบริษัทนี้ (สมาชิกกลุ่มอื่นไม่เห็น — ย้ายเข้า Shared ของกลุ่มได้ทีหลังจากหน้าสินค้า)`
        : `นำ "${customer.companyName}" ออกจากกลุ่มแล้ว — สินค้าเดิม ${oldHeads} รายการกลายเป็น Private ของบริษัทนี้ (มองเห็นเท่าเดิม)`,
    };
  }
  if (otherMembers > 0 && oldHeads > 0) {
    return {
      ok: true,
      summary: target
        ? `ย้าย "${customer.companyName}" เข้ากลุ่ม "${target.name}" แล้ว — Shared ${oldHeads} รายการของกลุ่ม "${membership.catalog.name}" ยังอยู่กับสมาชิกที่เหลือ (บริษัทนี้จะไม่เห็นรายการเหล่านั้นอีก — Private ของบริษัทติดตัวมาตามปกติ)`
        : `นำ "${customer.companyName}" ออกจากกลุ่ม "${membership.catalog.name}" แล้ว — จะไม่เห็น Shared ${oldHeads} รายการของกลุ่มอีก (Private ของบริษัทยังอยู่ครบ)`,
    };
  }
  return {
    ok: true,
    summary: target
      ? `ย้าย "${customer.companyName}" เข้ากลุ่ม "${target.name}" แล้ว`
      : `นำ "${customer.companyName}" ออกจากกลุ่มแล้ว`,
  };
}

/** Wrapper เดิมของการลากการ์ดบริษัททับกัน (dragged มาใช้กลุ่มของ target) — Semantics
 * ใหม่ทั้งหมดอยู่ใน moveCompanyToCatalog */
export async function moveCompanyIntoGroup(params: {
  draggedCustomerId: string;
  targetCustomerId: string;
  actorUserId: string;
}): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const { draggedCustomerId, targetCustomerId, actorUserId } = params;
  if (draggedCustomerId === targetCustomerId) return { ok: false, error: "ลากมาทับบริษัทเดียวกันเอง — ไม่มีอะไรต้องทำ" };
  const targetCatalog = await ensureCompanyCatalog(targetCustomerId, actorUserId);
  return moveCompanyToCatalog({ customerId: draggedCustomerId, targetCatalogId: targetCatalog.id, actorUserId });
}

// ---------------------------------------------------------------------------
// R10 — Catalog Group Management + สินค้าเสนอราคา + การนำสินค้าไปใช้กับลูกค้าจริง
// ---------------------------------------------------------------------------

export const QUOTATION_CATALOG_NAME = "สินค้าเสนอราคา";

/** Catalog พิเศษ "สินค้าเสนอราคา" — Singleton โดยการใช้งาน (หาแถว isQuotationCatalog
 * ตัวแรก ไม่มีค่อยสร้าง) — ไม่มีบริษัทสมาชิกเลยโดยเจตนา */
export async function ensureQuotationCatalog(): Promise<{ id: string; name: string }> {
  const existing = await db.productCatalog.findFirst({
    where: { isQuotationCatalog: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return db.productCatalog.create({
    data: { name: QUOTATION_CATALOG_NAME, isQuotationCatalog: true },
    select: { id: true, name: true },
  });
}

/** สร้าง Catalog Group เปล่า (ตั้งชื่อเอง แล้วค่อยลากบริษัทเข้า) */
export async function createCatalogGroup(name: string, actorUserId: string): Promise<{ id: string } | { error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "กรุณาตั้งชื่อกลุ่ม" };
  if (trimmed.length > 80) return { error: "ชื่อกลุ่มยาวเกิน 80 ตัวอักษร" };
  const catalog = await db.productCatalog.create({ data: { name: trimmed } });
  await db.auditLog.create({
    data: { userId: actorUserId, action: "CREATE_PRODUCT_CATALOG", module: "ProductCatalog", recordId: catalog.id, newValue: { name: trimmed } },
  });
  return { id: catalog.id };
}

/** เปลี่ยนชื่อกลุ่ม — เป็นแค่ป้าย ไม่กระทบสมาชิก/สินค้า/เอกสารใดๆ (FK ทุกตัวอ้าง id) */
export async function renameCatalog(catalogId: string, name: string, actorUserId: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return "กรุณาตั้งชื่อกลุ่ม";
  if (trimmed.length > 80) return "ชื่อกลุ่มยาวเกิน 80 ตัวอักษร";
  const catalog = await db.productCatalog.findUnique({ where: { id: catalogId }, select: { id: true, name: true } });
  if (!catalog) return "ไม่พบกลุ่ม";
  await db.$transaction([
    db.productCatalog.update({ where: { id: catalogId }, data: { name: trimmed } }),
    db.auditLog.create({
      data: { userId: actorUserId, action: "RENAME_PRODUCT_CATALOG", module: "ProductCatalog", recordId: catalogId, newValue: { from: catalog.name, to: trimmed } },
    }),
  ]);
  return null;
}

/** R10 — นำ Product Family Head (เช่นจาก "สินค้าเสนอราคา") ไปใช้กับลูกค้าจริง โดยไม่
 * Duplicate: ตั้งเป็น Shared ของกลุ่มบริษัทนั้น หรือ Private ของบริษัทนั้น — Head เดิมแถว
 * เดิม เอกสาร/Snapshot เดิมอ้างต่อได้ทุกใบ */
export async function adoptProductHeadsForCustomer(params: {
  customerId: string;
  productIds: string[];
  target: "shared" | "private";
  actorUserId: string;
}): Promise<{ ok: true; moved: number; summary: string } | { ok: false; error: string }> {
  const { customerId, productIds, target, actorUserId } = params;
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, companyName: true } });
  if (!customer) return { ok: false, error: "ไม่พบบริษัทลูกค้า" };
  const heads = await db.product.findMany({
    where: { id: { in: productIds }, parentProductId: null, modelId: null },
    select: { id: true },
  });
  if (heads.length === 0) return { ok: false, error: "ไม่พบสินค้า (Family Head) ที่เลือก" };

  const data =
    target === "shared"
      ? { catalogId: (await ensureCompanyCatalog(customerId, actorUserId)).id, ownerCustomerId: null }
      : { catalogId: null, ownerCustomerId: customerId };

  await db.$transaction([
    db.product.updateMany({ where: { id: { in: heads.map((h) => h.id) } }, data }),
    db.auditLog.create({
      data: {
        userId: actorUserId,
        action: "ADOPT_PRODUCTS_FOR_CUSTOMER",
        module: "Product",
        recordId: customerId,
        newValue: { productIds: heads.map((h) => h.id), target, companyName: customer.companyName },
      },
    }),
  ]);
  return {
    ok: true,
    moved: heads.length,
    summary:
      target === "shared"
        ? `ย้ายสินค้า ${heads.length} รายการเข้า Shared ของกลุ่ม "${customer.companyName}" แล้ว`
        : `ย้ายสินค้า ${heads.length} รายการเป็น Private ของ "${customer.companyName}" แล้ว`,
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
