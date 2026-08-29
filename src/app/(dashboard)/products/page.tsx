import { db } from "@/lib/db";
import { createProduct, toggleProductActive, deleteProduct, addCatalogCompany, removeCatalogCompany, createCatalogGroupAction, renameCatalogAction, moveCompanyToCatalogAction } from "./actions";
import { CatalogGroupBoard, type BoardGroup, type BoardMember } from "@/components/catalog-group-board";
import { bulkAssignProductModel } from "../product-models/actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";
import { CancelButton } from "@/components/cancel-button";
import { StatusTabs } from "@/components/status-tabs";
import { SearchInputWithClear } from "@/components/search-input-with-clear";
import { BackLink } from "@/components/back-link";

// Owner UAT Fix Batch — ข้อ 1: Product Status เป็น Active/Inactive ชัดเจนแบบเดียวกับ
// Document Status Tabs (StatusTabs Component เดิม)
type StatusFilter = "active" | "inactive" | undefined;

// ==========================================================================
// R9 (2026-08-26) — Company-first Product UX ตามที่ Owner กำหนด:
//   /products                    → หน้าแรกเป็น "รายชื่อบริษัท" (จาก Customer Master) +
//                                  การ์ดสินค้าส่วนกลาง + ลิงก์มุมมองตารางรวมแบบเดิม
//   /products?company=<id>       → รายการสินค้าของ Catalog บริษัทนั้น (เพิ่ม/แก้สินค้า =
//                                  ผูกกลุ่มอัตโนมัติ) + Panel จัดการบริษัทร่วมกลุ่ม (A+B+C
//                                  ใช้รายการเดียวกัน เพิ่ม/ถอดจากหน้าเดียว)
//   /products?view=central       → สินค้าส่วนกลาง (ทุกบริษัทเห็น — กฎเดิม)
//   /products?view=all           → ตารางรวมทุกสินค้าแบบเดิม + คอลัมน์กลุ่ม Catalog
// ตาราง/ฟอร์มสร้างสินค้า/Bulk Assign/สคริปต์ Dependent Dropdown = ของเดิมทั้งหมด แค่
// ถูกครอบด้วย Context การกรอง — Business Logic (Pricing/Size/SKU) ไม่แตะเลย
// ==========================================================================

type ViewCtx =
  | { kind: "landing" }
  | { kind: "groups" }
  | { kind: "quotation" }
  | { kind: "company"; customerId: string }
  | { kind: "central" }
  | { kind: "all" };

/** Where Fragment ของ "แถวสินค้าที่สังกัด Catalog K" — แถวสังกัดตาม Family Head ของมัน:
 * ตัวเอง (Standalone/Anchor) / Anchor แม่ (parentProduct) / ProductModel — เงื่อนไข
 * เดียวกับ Resolution ใน product-company-access.ts เสมอ */
function catalogRowsWhere(catalogId: string) {
  return {
    OR: [
      { catalogId },
      { parentProduct: { catalogId } },
      { AND: [{ parentProductId: null }, { model: { catalogId } }] },
    ],
  };
}

/** แถวสินค้าส่วนกลาง = Head ไม่สังกัด Catalog/ไม่ Private เลย */
function centralRowsWhere() {
  return {
    OR: [
      { AND: [{ parentProductId: null }, { modelId: null }, { catalogId: null }, { ownerCustomerId: null }] },
      { parentProduct: { catalogId: null, ownerCustomerId: null } },
      {
        AND: [
          { parentProductId: null },
          { modelId: { not: null } },
          { model: { catalogId: null, ownerCustomerId: null } },
        ],
      },
    ],
  };
}

/** R10 — แถวสินค้า Private ของบริษัท (ตาม Family Head เช่นเดียวกับ Shared) */
function privateRowsWhere(customerId: string) {
  return {
    OR: [
      { ownerCustomerId: customerId },
      { parentProduct: { ownerCustomerId: customerId } },
      { AND: [{ parentProductId: null }, { model: { ownerCustomerId: customerId } }] },
    ],
  };
}

export default async function ProductsPage(props: {
  searchParams: Promise<{ q?: string; unassigned?: string; status?: string; company?: string; view?: string; pscope?: string }>;
}) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim();
  const unassignedOnly = searchParams.unassigned === "1";
  const status: StatusFilter = searchParams.status === "active" || searchParams.status === "inactive" ? searchParams.status : undefined;

  const ctx: ViewCtx = searchParams.company
    ? { kind: "company", customerId: searchParams.company }
    : searchParams.view === "groups"
      ? { kind: "groups" }
      : searchParams.view === "quotation"
        ? { kind: "quotation" }
        : searchParams.view === "central"
          ? { kind: "central" }
          : searchParams.view === "all"
            ? { kind: "all" }
            : { kind: "landing" };
  // R10 — Company View: กรองย่อย Shared/Private (Default = ทั้งสองอย่างของบริษัทนั้น)
  const pscope = searchParams.pscope === "shared" || searchParams.pscope === "private" ? searchParams.pscope : undefined;

  // ---------- Landing: 2 หมวดหลักตามโครงที่ Owner กำหนด ----------
  if (ctx.kind === "landing") {
    const qcat = await db.productCatalog.findFirst({ where: { isQuotationCatalog: true }, select: { id: true } });
    const [companyCount, groupCount, quotationCount, allCount] = await Promise.all([
      db.customer.count({ where: { active: true } }),
      db.productCatalog.count({ where: { isQuotationCatalog: false, active: true } }),
      qcat ? db.product.count({ where: catalogRowsWhere(qcat.id) }) : Promise.resolve(0),
      db.product.count(),
    ]);

    return (
      <div className="max-w-5xl">
        <h1 className="text-lg font-semibold mb-1">รายการสินค้า</h1>
        <p className="text-sm text-gray-500 mb-4">เลือกหมวดรายการสินค้าที่ต้องการจัดการ</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <a href="/products?view=quotation" className="bg-white border rounded-lg p-5 hover:border-blue-400 hover:shadow-sm">
            <div className="font-medium">สินค้าเสนอราคา</div>
            <p className="mt-1 text-xs text-gray-500">
              Catalog สำหรับใบเสนอราคาแบบ &quot;กรอกข้อมูลเอง&quot; — ลูกค้าใน Customer Master ไม่เห็นหมวดนี้
            </p>
            <span className="mt-2 inline-block text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
              {quotationCount} รายการ
            </span>
          </a>
          <a href="/products?view=groups" className="bg-white border rounded-lg p-5 hover:border-blue-400 hover:shadow-sm">
            <div className="font-medium">สินค้าของลูกค้าที่อยู่ในระบบ</div>
            <p className="mt-1 text-xs text-gray-500">
              จัดกลุ่มบริษัท (Catalog Group) — Shared ทั้งกลุ่มเห็นร่วมกัน / Private เฉพาะบริษัท
            </p>
            <span className="mt-2 inline-block text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
              {groupCount} กลุ่ม · {companyCount} บริษัท
            </span>
          </a>
        </div>

        {/* R10.1 — Owner: ตัดการ์ด "สินค้าส่วนกลาง" ออกจากหน้าแรก (มีแค่ 2 หมวดหลักพอ) —
            Route ?view=central ยังอยู่เผื่อ Legacy/Link เก่า แค่ไม่โชว์เป็นทางเข้า */}
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/products?view=all" className="bg-white border rounded-lg px-4 py-3 hover:border-blue-400 text-gray-600">
            ตารางรวมทุกสินค้า (มุมมองเดิม) — {allCount} รายการ
          </a>
        </div>
      </div>
    );
  }

  // ---------- R10: บอร์ดกลุ่มบริษัท (สินค้าของลูกค้าที่อยู่ในระบบ) ----------
  if (ctx.kind === "groups") {
    const [catalogs, allCompanies] = await Promise.all([
      db.productCatalog.findMany({
        where: { isQuotationCatalog: false, active: true },
        select: {
          id: true,
          name: true,
          companies: {
            select: { customer: { select: { id: true, code: true, companyName: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.customer.findMany({
        where: { active: true },
        select: { id: true, code: true, companyName: true, catalogMembership: { select: { catalogId: true } } },
        orderBy: { companyName: "asc" },
      }),
    ]);

    const sharedCounts = new Map<string, number>(
      await Promise.all(
        catalogs.map(async (c) => [c.id, await db.product.count({ where: catalogRowsWhere(c.id) })] as [string, number])
      )
    );
    const privateCounts = new Map<string, number>(
      await Promise.all(
        allCompanies.map(async (c) => [c.id, await db.product.count({ where: privateRowsWhere(c.id) })] as [string, number])
      )
    );

    const toMember = (c: { id: string; code: string; companyName: string }): BoardMember => ({
      id: c.id,
      code: c.code,
      companyName: c.companyName,
      privateCount: privateCounts.get(c.id) ?? 0,
    });
    const groups: BoardGroup[] = catalogs.map((c) => ({
      id: c.id,
      name: c.name,
      sharedCount: sharedCounts.get(c.id) ?? 0,
      members: c.companies.map((m) => toMember(m.customer)),
    }));
    const ungrouped: BoardMember[] = allCompanies.filter((c) => !c.catalogMembership).map(toMember);

    return (
      <div className="max-w-5xl">
        <BackLink href="/products">← กลับรายการสินค้า</BackLink>
        <h1 className="text-lg font-semibold mt-2 mb-1">สินค้าของลูกค้าที่อยู่ในระบบ — กลุ่มบริษัท</h1>
        <p className="text-sm text-gray-500 mb-4">
          กดชื่อบริษัทเพื่อดู/เพิ่มสินค้า (Shared ของกลุ่ม + Private ของบริษัท) — ลากบริษัทเพื่อจัดกลุ่ม
        </p>
        <CatalogGroupBoard
          groups={groups}
          ungrouped={ungrouped}
          moveAction={moveCompanyToCatalogAction}
          createGroupAction={createCatalogGroupAction}
          renameAction={renameCatalogAction}
        />
        {allCompanies.length === 0 && (
          <p className="mt-4 text-sm text-gray-400">
            ยังไม่มีบริษัทลูกค้าในระบบ — เพิ่มที่เมนู <a href="/customers" className="text-blue-600 hover:underline">ลูกค้า</a> ก่อน
          </p>
        )}
      </div>
    );
  }

  // ---------- Company / Central / All: ตารางสินค้า (โครงเดิม + Context กรอง) ----------
  const company =
    ctx.kind === "company"
      ? await db.customer.findUnique({
          where: { id: ctx.customerId },
          select: {
            id: true,
            code: true,
            companyName: true,
            catalogMembership: {
              select: {
                catalog: {
                  select: {
                    id: true,
                    name: true,
                    companies: {
                      select: { customer: { select: { id: true, code: true, companyName: true } } },
                      orderBy: { createdAt: "asc" },
                    },
                  },
                },
              },
            },
          },
        })
      : null;
  if (ctx.kind === "company" && !company) {
    return (
      <div className="max-w-5xl">
        <BackLink href="/products">← กลับรายชื่อบริษัท</BackLink>
        <p className="mt-4 text-sm text-gray-500">ไม่พบบริษัทนี้</p>
      </div>
    );
  }
  const catalog = company?.catalogMembership?.catalog ?? null;

  // R10 — Catalog "สินค้าเสนอราคา" (มุมมอง quotation) — อ่านอย่างเดียวตอน Render (ยังไม่มี
  // = ตารางว่าง; Action สร้างให้เองตอนบันทึกสินค้าแรกผ่าน quotationCatalog=1)
  const quotationCatalog =
    ctx.kind === "quotation"
      ? await db.productCatalog.findFirst({ where: { isQuotationCatalog: true }, select: { id: true, name: true } })
      : null;

  // Context Where ต่อมุมมอง — Company = Shared ของกลุ่ม + Private ของบริษัท (กรองย่อยด้วย
  // pscope ได้) / Quotation = แถวของ Catalog สินค้าเสนอราคา
  const companyShared = ctx.kind === "company" && catalog ? catalogRowsWhere(catalog.id) : null;
  const companyPrivate = ctx.kind === "company" ? privateRowsWhere(ctx.customerId) : null;
  const ctxWhere =
    ctx.kind === "company"
      ? pscope === "shared"
        ? (companyShared ?? { id: "__none__" })
        : pscope === "private"
          ? companyPrivate!
          : { OR: [...(companyShared ? [companyShared] : []), companyPrivate!] }
      : ctx.kind === "quotation"
        ? quotationCatalog
          ? catalogRowsWhere(quotationCatalog.id)
          : { id: "__none__" }
        : ctx.kind === "central"
          ? centralRowsWhere()
          : {};

  const searchWhere = {
    ...(q
      ? { OR: [{ sku: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] }
      : {}),
    ...(unassignedOnly ? { modelId: null } : {}),
  };
  const baseWhere = { AND: [searchWhere, ctxWhere] };

  const [products, productTypes, categories, productModels, activeCount, inactiveCount, totalCount] = await Promise.all([
    db.product.findMany({
      where: { AND: [baseWhere, ...(status ? [{ active: status === "active" }] : [])] },
      include: {
        productType: true,
        category: true,
        model: { include: { catalog: { select: { name: true } }, ownerCustomer: { select: { companyName: true } } } },
        catalog: { select: { name: true } },
        ownerCustomer: { select: { companyName: true } },
        parentProduct: {
          select: { catalog: { select: { name: true } }, ownerCustomer: { select: { companyName: true } } },
        },
        _count: { select: { priceRules: true, orderItems: true, invoiceItems: true, quotationItems: true, sizeVariants: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productModel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.product.count({ where: { AND: [baseWhere, { active: true }] } }),
    db.product.count({ where: { AND: [baseWhere, { active: false }] } }),
    db.product.count({ where: baseWhere }),
  ]);

  const unassignedCount = await db.product.count({ where: { AND: [{ modelId: null }, ctxWhere] } });

  // บริษัทที่ยังไม่อยู่กลุ่มไหนเลย — ตัวเลือกสำหรับ "เพิ่มบริษัทร่วมใช้รายการนี้"
  const availableCompanies =
    ctx.kind === "company" && catalog
      ? await db.customer.findMany({
          where: { active: true, catalogMembership: null },
          select: { id: true, code: true, companyName: true },
          orderBy: { companyName: "asc" },
        })
      : [];

  const statusTabs = [
    { key: "all", label: "ทั้งหมด", count: totalCount },
    { key: "active", label: "ใช้งาน", count: activeCount },
    { key: "inactive", label: "ไม่ใช้งาน", count: inactiveCount },
  ];
  // R9 — คง Context (company/view) ในทุกลิงก์ Filter/Search/Tab
  const ctxParams: Record<string, string> =
    ctx.kind === "company"
      ? { company: ctx.customerId, ...(pscope ? { pscope } : {}) }
      : ctx.kind === "quotation"
        ? { view: "quotation" }
        : ctx.kind === "central"
          ? { view: "central" }
          : { view: "all" };
  const ctxQuery = new URLSearchParams(ctxParams).toString();

  const preserveParams: Record<string, string> = { ...ctxParams };
  if (q) preserveParams.q = q;
  if (unassignedOnly) preserveParams.unassigned = "1";
  const preserveParamsNoQ: Record<string, string> = { ...ctxParams };
  if (unassignedOnly) preserveParamsNoQ.unassigned = "1";
  if (status) preserveParamsNoQ.status = status;

  const modelsByType = productModels.map((m) => ({ id: m.id, name: m.name, productTypeId: m.productTypeId }));

  const heading =
    ctx.kind === "company"
      ? `สินค้าของ ${company!.companyName} (${company!.code})`
      : ctx.kind === "quotation"
        ? "สินค้าเสนอราคา"
        : ctx.kind === "central"
          ? "สินค้าส่วนกลาง (ทุกบริษัทเห็น)"
          : "ตารางรวมทุกสินค้า";

  /** ป้ายสังกัดของแถว (ตาม Family Head): ชื่อกลุ่ม Shared / "Private — บริษัท" / ส่วนกลาง */
  const rowCatalogName = (p: (typeof products)[number]): string | null => {
    if (p.parentProductId) {
      return p.parentProduct?.catalog?.name ?? (p.parentProduct?.ownerCustomer ? `Private — ${p.parentProduct.ownerCustomer.companyName}` : null);
    }
    if (p.modelId) {
      return p.model?.catalog?.name ?? (p.model?.ownerCustomer ? `Private — ${p.model.ownerCustomer.companyName}` : null);
    }
    return p.catalog?.name ?? (p.ownerCustomer ? `Private — ${p.ownerCustomer.companyName}` : null);
  };
  /** R10 — Company View: แถวนี้เป็น Private ของบริษัทที่กำลังดูอยู่ไหม (แสดง Badge) */
  const rowIsPrivate = (p: (typeof products)[number]): boolean =>
    p.parentProductId
      ? !!p.parentProduct?.ownerCustomer
      : p.modelId
        ? !!p.model?.ownerCustomer
        : !!p.ownerCustomer;

  return (
    <div className="max-w-5xl">
      <BackLink href={ctx.kind === "company" ? "/products?view=groups" : "/products"}>
        {ctx.kind === "company" ? "← กลับกลุ่มบริษัท" : "← กลับรายการสินค้า"}
      </BackLink>
      <h1 className="text-lg font-semibold mt-2 mb-1">{heading}</h1>
      {ctx.kind === "company" && (
        <p className="text-sm text-gray-500 mb-3">
          เห็นทั้ง Shared ของกลุ่ม{catalog ? ` "${catalog.name}"` : ""} และ Private ของบริษัทนี้ — ตอนออกเอกสารให้บริษัทนี้เห็น Shared + Private + สินค้าส่วนกลาง
        </p>
      )}
      {ctx.kind === "quotation" && (
        <p className="text-sm text-gray-500 mb-3">
          Catalog สำหรับใบเสนอราคาแบบ &quot;กรอกข้อมูลเอง&quot; — ลูกค้าใน Customer Master ไม่เห็นรายการหมวดนี้ตอนออกเอกสาร
          (นำสินค้าไปใช้กับลูกค้าจริงได้จากหน้า &quot;ใบเสนอราคาลูกค้าที่ไม่มีในระบบ&quot; หลังเชื่อมลูกค้าแล้ว)
        </p>
      )}
      {ctx.kind === "central" && (
        <p className="text-sm text-gray-500 mb-3">สินค้าที่ไม่สังกัดกลุ่มบริษัทใด — ทุกบริษัทค้นหา/เลือกใช้ได้ตอนออกเอกสารเสมอ</p>
      )}
      {/* R10 — Company View: กรองย่อย Shared/Private */}
      {ctx.kind === "company" && (
        <div className="flex items-center gap-2 mb-3 text-xs">
          {/* R10.2 — สี Chip สอดคล้องกล่อง Shared/Private ในฟอร์ม: Shared=เขียว Private=เหลือง */}
          {(
            [
              {
                key: undefined,
                label: "ทั้งหมด",
                active: "bg-blue-600 text-white border-blue-600",
                idle: "text-gray-600 hover:bg-gray-50",
              },
              {
                key: "shared",
                label: "Shared ของกลุ่ม",
                active: "bg-emerald-600 text-white border-emerald-600",
                idle: "text-emerald-700 border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50",
              },
              {
                key: "private",
                label: "Private ของบริษัทนี้",
                active: "bg-amber-500 text-white border-amber-500",
                idle: "text-amber-700 border-amber-300 bg-amber-50/60 hover:bg-amber-50",
              },
            ] as const
          ).map((t) => (
            <a
              key={t.label}
              href={`/products?company=${ctx.customerId}${t.key ? `&pscope=${t.key}` : ""}`}
              className={`rounded-full border px-3 py-1 ${pscope === t.key ? t.active : t.idle}`}
            >
              {t.label}
            </a>
          ))}
        </div>
      )}

      {/* R9 — Panel บริษัทร่วมกลุ่ม (Shared Catalog): A+B+C ใช้รายการเดียวกัน เพิ่ม/ถอดจากหน้าเดียว */}
      {ctx.kind === "company" && catalog && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <div className="text-sm font-medium mb-1">บริษัทที่ใช้รายการสินค้าชุดนี้ร่วมกัน</div>
          <p className="text-xs text-gray-500 mb-2">
            ถอดบริษัทออก = บริษัทนั้นไม่เห็นรายการนี้ตอนออกเอกสารใหม่ (สินค้า/เอกสารเดิมไม่ถูกกระทบ)
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {catalog.companies.map((m) => (
              <span key={m.customer.id} className="inline-flex items-center gap-1.5 text-sm bg-blue-50 text-blue-800 border border-blue-200 rounded-full pl-3 pr-1.5 py-1">
                {m.customer.companyName} ({m.customer.code})
                {catalog.companies.length > 1 && (
                  <CancelButton
                    action={removeCatalogCompany.bind(null, catalog.id, m.customer.id)}
                    confirmMessage={`ถอด "${m.customer.companyName}" ออกจากกลุ่มรายการสินค้านี้? บริษัทนั้นจะไม่เห็นรายการนี้ตอนออกเอกสารใหม่ (สินค้า/เอกสารเดิมไม่ถูกกระทบ)`}
                    label="×"
                    successMessage="ถอดบริษัทออกจากกลุ่มแล้ว"
                    className="text-xs text-blue-400 hover:text-red-600 border-0 rounded-full px-1.5 py-0.5"
                  />
                )}
              </span>
            ))}
          </div>
          {availableCompanies.length > 0 ? (
            <ActionForm
              action={addCatalogCompany.bind(null, catalog.id)}
              successMessage="เพิ่มบริษัทเข้ากลุ่มแล้ว"
              className="flex items-end gap-2 max-w-md"
            >
              <div className="flex-1">
                <SelectField label="เพิ่มบริษัทร่วมใช้รายการนี้" name="customerId" defaultValue="">
                  <option value="" disabled>— เลือกบริษัท —</option>
                  {availableCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.code})
                    </option>
                  ))}
                </SelectField>
              </div>
              <SubmitButton className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2">เพิ่มเข้ากลุ่ม</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-xs text-gray-400">ทุกบริษัทมีกลุ่มรายการสินค้าของตัวเองแล้ว — ถ้าต้องการย้ายบริษัทมากลุ่มนี้ ให้ถอดออกจากกลุ่มเดิมก่อน</p>
          )}
        </div>
      )}

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">
          + เพิ่มสินค้าใหม่
          {ctx.kind === "company"
            ? ` (ของ ${company!.companyName})`
            : ctx.kind === "quotation"
              ? " (เข้าสินค้าเสนอราคา)"
              : ctx.kind === "central"
                ? " (สินค้าส่วนกลาง)"
                : ""}
        </summary>
        <ActionForm id="createProductForm" action={createProduct} successMessage="เพิ่มสินค้าสำเร็จ" resetOnSuccess className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* R9 — สร้างจากหน้าบริษัท = ผูก Catalog บริษัทนั้นอัตโนมัติ (Server สร้าง Catalog
              ให้เองถ้ายังไม่มี) — มุมมองส่วนกลาง/รวม ไม่ส่ง = สินค้าส่วนกลาง */}
          {ctx.kind === "company" && <input type="hidden" name="companyId" value={company!.id} />}
          {ctx.kind === "quotation" && <input type="hidden" name="quotationCatalog" value="1" />}
          {/* R10.2 — Owner: เน้นสีเฉพาะจุดตัดสินใจ Shared/Private เท่านั้น (ไม่สาดสีทุกช่อง)
              — สองกรอบแยกชัด สีทั้งกรอบโทน Earth ให้ตัวอักษรยังชัด: Shared=เขียว /
              Private=เหลือง — โทนเดียวกันนี้ใช้ซ้ำทั้ง Chip กรองและ Badge ในตารางให้จำง่าย */}
          {ctx.kind === "company" && (
            <div className="col-span-1 sm:col-span-3">
              <div className="text-xs text-gray-600 mb-1.5">สินค้านี้เป็นของ:</div>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 rounded-full border-2 border-emerald-500 bg-emerald-50 pl-4 pr-5 py-2 cursor-pointer text-emerald-900">
                  <input type="radio" name="visibility" value="shared" defaultChecked className="accent-emerald-600" />
                  <span className="text-sm whitespace-nowrap">
                    <span className="font-semibold">Shared</span> — ทุกบริษัทในกลุ่ม{catalog ? ` "${catalog.name}"` : ""}เห็นร่วมกัน
                  </span>
                </label>
                <label className="flex items-center gap-2 rounded-full border-2 border-amber-500 bg-amber-50 pl-4 pr-5 py-2 cursor-pointer text-amber-900">
                  <input type="radio" name="visibility" value="private" className="accent-amber-600" />
                  <span className="text-sm whitespace-nowrap">
                    <span className="font-semibold">Private</span> — เฉพาะ {company!.companyName}
                  </span>
                </label>
              </div>
            </div>
          )}
          <Field label="รหัสสินค้า / Code (เว้นว่าง = ระบบสร้างให้อัตโนมัติ)" name="sku" />
          <div className="col-span-1 sm:col-span-2">
            <Field label="ชื่อสินค้า *" name="name" required />
          </div>
          <SelectField label="กลุ่มส่วนลด (ถ้ามี)" name="productTypeId" defaultValue="">
            <option value="">— ไม่ระบุกลุ่มส่วนลด —</option>
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="ประเภทสินค้า (ถ้ามี)" name="categoryId" defaultValue="">
            <option value="">— ไม่ระบุประเภทสินค้า —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          {/* Owner UAT — ข้อ 1: "รุ่นสินค้า" เป็น Legacy/Advanced แล้ว — ปกติไม่ต้องใช้อีก
              ต่อไป (เว้นว่างไว้เสมอ) เพราะ Size/Pricing ทำงานจาก Product ตรงๆ ได้แล้วผ่าน
              ช่อง "ราคาต่อฟุต" ด้านล่าง — ยังคง Field ไว้เพื่อ Backward Compatible กับ
              Workflow เดิม (ผูก Product เข้ากับ ProductModel ที่มีอยู่แล้วได้เหมือนเดิม) */}
          <SelectField label="รุ่นสินค้า (Legacy — ปกติไม่ต้องใช้)" name="modelId" defaultValue="">
            <option value="">— ไม่ผูก (ปกติ) —</option>
          </SelectField>
          <div id="createUsesSizeWarning" className="col-span-1 sm:col-span-3 hidden text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠️ ประเภทสินค้านี้ใช้ขนาด (Size) — กรุณากรอก &quot;ราคาต่อฟุต&quot; ด้านล่าง เพื่อให้เลือกขนาดได้ตอนออกเอกสาร
            มิฉะนั้นสินค้านี้จะไม่มีตัวเลือกขนาดให้เลือกเลย
          </div>
          <Field label="หน่วย * (เช่น หลัง, ใบ)" name="unit" required />
          <div id="createStandardPriceWrap">
            <Field label="ราคาตั้งต้น (รวม VAT) *" name="standardPrice" type="number" required />
          </div>
          {/* R11 — ข้อ 6 (Owner): "Size สินค้า" สำหรับที่นอนที่ขายต่อหลัง (ราคาไม่ผูกกับ
              ฟุต) — กรอกราคาเฉพาะไซส์ที่ต้องการ ระบบสร้าง Variant ให้ทันทีและเชื่อมระบบ
              เลือกสินค้าตอนออกเอกสารอัตโนมัติ (โครง Anchor+Variant เดิม) — ใช้ไม่ได้พร้อม
              ราคาต่อฟุต/รุ่นสินค้า (Server ตรวจซ้ำ) */}
          <details className="col-span-1 sm:col-span-3 border rounded-lg bg-gray-50/60">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              + Size สินค้า (กำหนดราคาเองต่อไซส์ — สำหรับสินค้าที่ขายต่อหลัง/ต่อหน่วย)
            </summary>
            <div className="px-3 pb-3">
              <p className="text-xs text-gray-500 mb-2">
                กรอกราคาเฉพาะไซส์ที่มีขาย (เว้นว่าง = ไม่สร้างไซส์นั้น) — แต่ละไซส์แก้ราคาทีหลังได้รายตัวจากหน้ารายการสินค้า
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {["3 ฟุต", "3.5 ฟุต", "4 ฟุต", "5 ฟุต", "6 ฟุต"].map((sz) => (
                  <div key={sz} className="flex items-center gap-2">
                    <input type="hidden" name="msLabel" value={sz} />
                    <span className="text-sm w-14 shrink-0">{sz}</span>
                    <input
                      name="msPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="ราคา (รวม VAT)"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input name="msLabel" placeholder="ไซส์พิเศษ" className="w-24 shrink-0 border rounded px-2 py-1.5 text-sm" />
                  <input
                    name="msPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="ราคา (รวม VAT)"
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          </details>
          <div id="createPricePerFootWrap" className="col-span-1 sm:col-span-3 hidden">
            <Field
              label="ราคาต่อฟุต (รวม VAT) — กรอกเพื่อสร้าง Size 3/3.5/4/5/6 ฟุต + ขนาดพิเศษ อัตโนมัติ"
              name="pricePerFoot"
              type="number"
            />
          </div>
          <div className="col-span-1 sm:col-span-3">
            <Field label="คำอธิบาย" name="description" />
          </div>
          <div className="col-span-1 sm:col-span-3">
            <SubmitButton>บันทึกสินค้า</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <div className="flex items-center justify-between mb-3 gap-3">
        <form className="flex-1">
          <SearchInputWithClear
            defaultValue={q}
            placeholder="ค้นหาด้วยรหัสสินค้าหรือชื่อสินค้า..."
            basePath="/products"
            preserveParams={preserveParamsNoQ}
            formParams={preserveParamsNoQ}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>
        <a
          href={unassignedOnly ? `/products?${ctxQuery}` : `/products?${ctxQuery}&unassigned=1`}
          className={`text-xs whitespace-nowrap px-3 py-2 rounded border ${
            unassignedOnly ? "bg-amber-50 border-amber-300 text-amber-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {unassignedOnly ? "✓ " : ""}ยังไม่ระบุรุ่นสินค้า ({unassignedCount})
        </a>
      </div>

      {unassignedOnly && productModels.length > 0 && (
        <ActionForm
          id="bulkAssignForm"
          action={bulkAssignProductModel}
          successMessage="กำหนดรุ่นสินค้าสำเร็จ"
          className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-center gap-2 text-sm"
        >
          <span className="text-gray-600 shrink-0">กำหนดรุ่นสินค้าให้รายการที่เลือกไว้ทั้งหมดเป็น:</span>
          <div className="flex-1">
            <SelectField label="" name="modelId" required defaultValue="">
              <option value="" disabled>
                เลือกรุ่นสินค้า
              </option>
              {productModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          </div>
          <SubmitButton className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded px-3 py-1.5">
            กำหนดรุ่น
          </SubmitButton>
        </ActionForm>
      )}

      <StatusTabs tabs={statusTabs} activeKey={status ?? "all"} basePath="/products" preserveParams={preserveParams} />

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              {unassignedOnly && <th className="px-4 py-2 w-8"></th>}
              <th className="px-4 py-2 font-medium">รหัสสินค้า</th>
              <th className="px-4 py-2 font-medium">ชื่อสินค้า</th>
              <th className="px-4 py-2 font-medium">ขนาด</th>
              <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
              <th className="px-4 py-2 font-medium">ประเภทสินค้า</th>
              <th className="px-4 py-2 font-medium">รุ่นสินค้า</th>
              {ctx.kind === "all" && <th className="px-4 py-2 font-medium">กลุ่มบริษัท</th>}
              {ctx.kind === "company" && <th className="px-4 py-2 font-medium">ประเภท</th>}
              <th className="px-4 py-2 font-medium">หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">ราคาตั้งต้น</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                {unassignedOnly && (
                  <td className="px-4 py-2">
                    <input type="checkbox" name="productId" value={p.id} form="bulkAssignForm" className="product-checkbox" />
                  </td>
                )}
                <td className="px-4 py-2 font-mono">{p.sku}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.size ?? <span className="text-gray-400">-</span>}</td>
                <td className="px-4 py-2">
                  {p.productType ? p.productType.name : <span className="text-gray-400">ไม่ระบุกลุ่มส่วนลด</span>}
                </td>
                <td className="px-4 py-2">
                  {p.category ? p.category.name : <span className="text-gray-400">— ไม่ระบุ —</span>}
                </td>
                <td className="px-4 py-2">
                  {p.model ? p.model.name : <span className="text-gray-400">— ยังไม่ระบุ —</span>}
                </td>
                {ctx.kind === "all" && (
                  <td className="px-4 py-2">
                    {rowCatalogName(p) ?? <span className="text-gray-400">ส่วนกลาง</span>}
                  </td>
                )}
                {ctx.kind === "company" && (
                  <td className="px-4 py-2">
                    {rowIsPrivate(p) ? (
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5 whitespace-nowrap">
                        Private
                      </span>
                    ) : (
                      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5 whitespace-nowrap">
                        Shared
                      </span>
                    )}
                  </td>
                )}
                <td className="px-4 py-2">{p.unit}</td>
                <td className="px-4 py-2 text-right">
                  {Number(p.standardPrice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                      p.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {p.active ? "ใช้งาน" : "ไม่ใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  {/* R10.1 — Owner: กดแก้ไขแล้วกดกลับ ต้องกลับหน้ารายการเดิม (บริษัท/มุมมอง
                      ที่เปิดอยู่) ไม่ใช่เด้งไปหน้าแรกให้เลือกใหม่ */}
                  <a
                    href={`/products/${p.id}?back=${encodeURIComponent(`/products?${ctxQuery}`)}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    แก้ไข
                  </a>
                  {(() => {
                    // Owner UAT Fix Batch 3 — ข้อ 2: แสดงเหตุผลชัดเจนว่าลบถาวรไม่ได้เพราะอะไร
                    const refBreakdown: { count: number; label: string }[] = [
                      { count: p._count.sizeVariants, label: "ขนาดย่อย" },
                      { count: p._count.orderItems, label: "รายการในออเดอร์" },
                      { count: p._count.invoiceItems, label: "รายการใน Invoice" },
                      { count: p._count.quotationItems, label: "รายการในใบเสนอราคา" },
                      { count: p._count.priceRules, label: "ราคาเฉพาะลูกค้า/สาขา" },
                    ].filter((r) => r.count > 0);
                    const totalRefs = refBreakdown.reduce((s, r) => s + r.count, 0);
                    if (totalRefs === 0) {
                      return (
                        <CancelButton
                          action={deleteProduct.bind(null, p.id)}
                          confirmMessage={`ยืนยันลบสินค้า "${p.name}" อย่างถาวร? การลบนี้ย้อนกลับไม่ได้ (สินค้านี้ไม่มีเอกสาร/ราคาเฉพาะ/ขนาดย่อยอ้างอิงอยู่เลย ลบได้อย่างปลอดภัย)`}
                          label="ลบถาวร"
                          successMessage="ลบสินค้าสำเร็จ"
                          className="text-xs text-gray-500 hover:text-red-600 border-0 p-0 inline"
                        />
                      );
                    }
                    const detail = refBreakdown.map((r) => `${r.label} ${r.count} รายการ`).join(", ");
                    return (
                      <span
                        title={`ลบถาวรไม่ได้เพราะยังมีการใช้งานอ้างอิงอยู่: ${detail} (ประวัติเอกสาร/ราคาเฉพาะ/ขนาดย่อยต้องรักษาไว้เสมอ — ใช้ "ปิดใช้งาน" แทนถ้าต้องการซ่อนจากการค้นหา)`}
                        className="text-xs text-gray-400 whitespace-nowrap cursor-help"
                      >
                        ลบถาวรไม่ได้ ({totalRefs} รายการ)
                      </span>
                    );
                  })()}
                  <form action={toggleProductActive.bind(null, p.id)} className="inline">
                    <button className="text-xs text-gray-500 hover:text-red-600">
                      {p.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                  {ctx.kind === "company"
                    ? "ยังไม่มีสินค้าในมุมมองนี้ — กด “+ เพิ่มสินค้าใหม่” ด้านบน (เลือก Shared เข้ากลุ่ม หรือ Private เฉพาะบริษัทนี้) หรือจัดกลุ่มบริษัทจากหน้ากลุ่ม"
                    : ctx.kind === "quotation"
                      ? "ยังไม่มีสินค้าเสนอราคา — กด “+ เพิ่มสินค้าใหม่” เพื่อเริ่ม (ระบบสร้าง Catalog สินค้าเสนอราคาให้อัตโนมัติ)"
                      : "ไม่พบสินค้า"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Type→Model dependent dropdown บนฟอร์มสร้างสินค้า — Pattern เดียวกับ
          Customer→Branch ที่ใช้อยู่แล้ว ไม่มี Business Logic ใดๆ แค่กรอง option */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const modelsByType = ${safeJsonForScript(modelsByType)};
            const productTypeSelect = document.querySelector('#createProductForm select[name="productTypeId"]');
            const modelSelect = document.querySelector('#createProductForm select[name="modelId"]');
            function updateModels() {
              const typeId = productTypeSelect.value;
              modelSelect.innerHTML = '<option value="">— ไม่ผูก (ปกติ) —</option>';
              modelsByType.filter(m => m.productTypeId === typeId).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                modelSelect.appendChild(opt);
              });
              // เปลี่ยน productTypeId ล้าง modelId กลับเป็นว่างเสมอ (เปลี่ยนแบบ Programmatic
              // ไม่ยิง change Event เอง) ต้องเรียกอัปเดตคำเตือนต่อเองตรงนี้ — ปลอดภัยเพราะ
              // Function Declaration ถูก Hoist ไว้แล้ว แม้เขียนอยู่ท้าย Script (เรียกได้
              // ก็ต่อเมื่อมี Event จริงจากผู้ใช้เท่านั้น ไม่ใช่ตอน Script รันครั้งแรก)
              updatePricePerFootUi();
            }
            productTypeSelect.addEventListener('change', updateModels);

            // Owner UAT Fix Batch 1 — ข้อ 1: สลับป้ายราคาตาม Category.usesSize
            const categoriesUsesSize = ${safeJsonForScript(categories.map((c) => ({ id: c.id, usesSize: c.usesSize })))};
            const categorySelect = document.querySelector('#createProductForm select[name="categoryId"]');
            const priceLabel = document.querySelector('#createProductForm label[for="standardPrice"]');
            function updatePriceLabel() {
              const cat = categoriesUsesSize.find(c => c.id === categorySelect.value);
              priceLabel.textContent = cat && cat.usesSize ? 'ราคาต่อฟุต (รวม VAT) *' : cat ? 'ราคาต่อหน่วย (รวม VAT) *' : 'ราคาตั้งต้น (รวม VAT) *';
            }
            // หมายเหตุ: ห้ามเรียก updatePriceLabel() ทันทีตอน Script รัน — Category
            // เริ่มต้นของฟอร์มนี้เป็นค่าว่างเสมอ (ตรงกับป้ายเริ่มต้นที่ Server Render
            // มาให้แล้ว) เรียกตอนนี้จะไป Mutate DOM Node ที่ React (Field Component)
            // กำลัง Hydrate อยู่ ทำให้ Text ไม่ตรงกับที่ Server Render จริง เกิด Hydration
            // Mismatch (React Error #418) แล้วทำให้ทั้งฟอร์ม Remount ใหม่ฝั่ง Client
            // (Query Selector อื่นที่จับ Element ไว้ก่อนหน้ากลายเป็น Node ที่หลุดออกจาก
            // DOM จริงไปเงียบๆ) — ให้ทำงานเฉพาะตอนมี change Event จริงจากผู้ใช้เท่านั้น
            categorySelect.addEventListener('change', updatePriceLabel);

            // Owner UAT — ข้อ 1: โชว์ช่อง "ราคาต่อฟุต" เฉพาะตอนเลือกประเภทสินค้าที่ใช้ขนาด
            // และไม่ได้ผูกรุ่นสินค้า (Legacy) — ดูคำอธิบายเต็มใน History ของไฟล์นี้
            const usesSizeWarning = document.getElementById('createUsesSizeWarning');
            const pricePerFootWrap = document.getElementById('createPricePerFootWrap');
            const pricePerFootInput = document.querySelector('#createProductForm input[name="pricePerFoot"]');
            const standardPriceWrap = document.getElementById('createStandardPriceWrap');
            const standardPriceInput = document.querySelector('#createProductForm input[name="standardPrice"]');
            function updatePricePerFootUi() {
              const cat = categoriesUsesSize.find(c => c.id === categorySelect.value);
              const usesSize = !!(cat && cat.usesSize);
              const hasModel = !!modelSelect.value;
              const isSizedAnchor = usesSize && !hasModel;

              pricePerFootWrap.classList.toggle('hidden', !usesSize);
              pricePerFootInput.disabled = hasModel;
              if (hasModel) pricePerFootInput.value = '';
              pricePerFootInput.required = isSizedAnchor;

              standardPriceWrap.classList.toggle('hidden', isSizedAnchor);
              standardPriceInput.required = !isSizedAnchor;
              standardPriceInput.disabled = isSizedAnchor;

              const showWarning = isSizedAnchor && !pricePerFootInput.value;
              usesSizeWarning.classList.toggle('hidden', !showWarning);
            }
            categorySelect.addEventListener('change', updatePricePerFootUi);
            modelSelect.addEventListener('change', updatePricePerFootUi);
            pricePerFootInput.addEventListener('input', updatePricePerFootUi);
          `,
        }}
      />
    </div>
  );
}
