import { db } from "@/lib/db";
import { UNSPECIFIED_TYPE_CODE, UNSPECIFIED_TYPE_LABEL } from "@/lib/order-preview";

// ==========================================================================
// REPORTS ENGINE (ข้อ 35-41)
// อ่านจาก InvoiceItem (join Invoice) เท่านั้น — ไม่รวม Invoice ที่ Cancelled
// Aggregate ฝั่ง Server เสมอ (ข้อ 55: ห้ามส่งข้อมูลดิบทั้งหมดไป process
// ที่ Browser) ตัว Filter ถูก apply ที่ Database query ทั้งหมดก่อน แล้ว
// ค่อย group ต่อในหน่วยความจำฝั่ง Server (ปริมาณข้อมูลระดับ SME รับได้
// สบายๆ — ถ้าข้อมูลเยอะมากในอนาคตค่อย optimize เป็น SQL GROUP BY ตรงๆ)
// ==========================================================================

export type ReportFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  customerId?: string;
  branchId?: string;
  productTypeCode?: string;
  sku?: string;
};

// Owner UAT Fix Batch 1 — ข้อ 3: Sentinel สำหรับ Invoice ที่ไม่มีสาขา (บริษัทไม่มีสาขา) —
// mirror UNSPECIFIED_TYPE_CODE/LABEL ทุกประการ ใช้ Group By "branch" เท่านั้น
export const UNSPECIFIED_BRANCH_KEY = "NO_BRANCH";
export const UNSPECIFIED_BRANCH_LABEL = "ไม่มีสาขา";

export type Metrics = { quantity: number; gross: number; discount: number; net: number; vat: number; total: number };

function emptyMetrics(): Metrics {
  return { quantity: 0, gross: 0, discount: 0, net: 0, vat: 0, total: 0 };
}

type Row = {
  quantity: number;
  gross: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
  invoiceDate: Date;
  customerId: string;
  customerName: string;
  // Owner UAT Fix Batch 1 — ข้อ 3: Invoice ไม่มีสาขาได้แล้ว (บริษัทไม่มีสาขา)
  branchId: string | null;
  branchName: string | null;
  productTypeCode: string;
  sku: string;
  productName: string;
};

function addRow(m: Metrics, row: Row): Metrics {
  return {
    quantity: m.quantity + row.quantity,
    gross: m.gross + row.gross,
    discount: m.discount + row.discount,
    net: m.net + row.net,
    vat: m.vat + row.vat,
    total: m.total + row.total,
  };
}

// R6 Phase D — Sales Source of Truth: "ยอดขายจริง" = เฉพาะ Invoice ("ใบส่งของชั่วคราว")
// ที่ผ่าน PRINTED Checkpoint แล้วเท่านั้น (ยืนยันพิมพ์กระดาษต่อเนื่อง 9×11 จริง ผ่าน
// markInvoicePrinted) — Confirm อย่างเดียวไม่นับ, Cancel ไม่นับ (สอดคล้องกับพฤติกรรม
// เดิมที่กันไปแล้วผ่าน status ≠ CANCELLED) จุดเดียวนี้ที่ fetchRows/fetchProductRows
// ทั้งคู่เรียกใช้ ทำให้ Dashboard/Top10/Monthly Sales/Sales Growth/Branch Report/
// /reports ทั่วไป ใช้ฐานข้อมูลเดียวกันเป๊ะโดยอัตโนมัติ ไม่ต้องแก้ที่อื่นซ้ำ
const SALES_SOT_STATUS = "PRINTED" as const;

async function fetchRows(filters: ReportFilters): Promise<Row[]> {
  const items = await db.invoiceItem.findMany({
    where: {
      skuSnapshot: filters.sku,
      invoice: {
        status: SALES_SOT_STATUS,
        invoiceDate: { gte: filters.dateFrom, lte: filters.dateTo },
        customerId: filters.customerId,
        branchId: filters.branchId,
        productTypeCode: filters.productTypeCode,
      },
    },
    include: { invoice: true },
  });

  const rows: Row[] = items.map((item) => ({
    quantity: Number(item.quantity),
    gross: Number(item.grossAmount),
    // Smoke Test R12 (2026-08-25) — Owner: ยอดสุทธิ (Net) ของรายงาน/Dashboard ต้องหักส่วนลด
    // กลุ่ม "เสมอ" ตามกลุ่มของสินค้า ไม่ขึ้นกับว่าใบส่งของใบนั้นเลือกใช้/แสดงส่วนลดหรือไม่
    // (การแสดงบนกระดาษเป็นการตัดสินใจแยกของ Owner) — อ่านจาก statDiscountAmount ที่
    // Snapshot ไว้ตอน Confirm (ใบที่ใช้ส่วนลดจริง ค่านี้ = discountAmount เป๊ะอยู่แล้ว)
    discount: Number(item.statDiscountAmount),
    net: Number(item.grossAmount) - Number(item.statDiscountAmount),
    vat: Number(item.vatAmount),
    total: Number(item.totalAmount),
    invoiceDate: item.invoice.invoiceDate,
    customerId: item.invoice.customerId,
    customerName: item.invoice.customerNameSnapshot,
    branchId: item.invoice.branchId,
    branchName: item.invoice.branchNameSnapshot,
    productTypeCode: item.invoice.productTypeCode,
    sku: item.skuSnapshot,
    productName: item.productNameSnapshot,
  }));

  // R11 (2026-08-27) — ถอดกลไก countAsSales ออกจากยอดขายฝั่งนี้ทั้งหมด (เดิม R13 ผสมใบ
  // กำกับภาษีที่ Owner ยืนยันตอนพิมพ์เข้ามาเป็นกลุ่ม "TAX") — ตอนนี้ใบกำกับภาษีมี Dashboard
  // Card + รายงานแยกของตัวเองแล้ว (fetchPrintedTaxInvoiceList/getTaxInvoiceSummary ด้านล่าง)
  // ยอดฝั่งนี้จึงเป็น "ใบส่งของชั่วคราว PRINTED ล้วนๆ" เสมอ ไม่มีการผสม/คำถามตอนพิมพ์อีก
  // (คอลัมน์ countAsSales ยังอยู่ใน Schema เฉยๆ ไม่ถูกอ่าน/เขียนอีกต่อไป — ไม่ Migrate)

  return rows;
}

export async function getSalesSummary(filters: ReportFilters): Promise<Metrics> {
  const rows = await fetchRows(filters);
  return rows.reduce(addRow, emptyMetrics());
}

export type GroupKey = "month" | "customer" | "branch" | "productType" | "sku";

export type GroupResult = { key: string; label: string; metrics: Metrics };

/** ข้อ 36: Group By เดือน/ลูกค้า/สาขา/กลุ่มส่วนลด (ProductType)/SKU */
export async function getSalesByGroup(filters: ReportFilters, groupBy: GroupKey): Promise<GroupResult[]> {
  const rows = await fetchRows(filters);
  const map = new Map<string, GroupResult>();

  // ชื่อ ProductType ต้องดึงจาก Master ปัจจุบันเสมอ ไม่ hardcode "TYPE X" — ต่างจาก
  // Invoice/InvoiceItem ที่ snapshot ไว้ตอนออกบิล เพราะ report/dashboard เป็นมุมมอง
  // สรุปข้อมูลปัจจุบัน ไม่ใช่เอกสารที่ต้องคงสภาพย้อนหลังแบบ Invoice/Tax Invoice
  const typeNameByCode =
    groupBy === "productType"
      ? new Map((await db.productType.findMany({ select: { code: true, name: true } })).map((t) => [t.code, t.name]))
      : null;

  for (const row of rows) {
    let key: string;
    let label: string;
    switch (groupBy) {
      case "month": {
        const d = row.invoiceDate;
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        label = key;
        break;
      }
      case "customer":
        key = row.customerId;
        label = row.customerName;
        break;
      case "branch":
        // Owner UAT Fix Batch 1 — ข้อ 3: ไม่มีสาขา → รวมกลุ่มเป็น "ไม่มีสาขา" (Sentinel
        // เดียวกับแนวทาง UNSPECIFIED_TYPE_CODE ของ productType ด้านล่าง)
        key = row.branchId ?? UNSPECIFIED_BRANCH_KEY;
        label = row.branchName ?? UNSPECIFIED_BRANCH_LABEL;
        break;
      case "productType":
        key = row.productTypeCode;
        // R4 — "GEN" (สินค้าไม่ระบุประเภท) ไม่มี ProductType Master รองรับจริง ต้อง Label
        // เป็น "ไม่ระบุประเภท" เสมอ ไม่ใช่โชว์ Internal Code ดิบๆ ให้ผู้ใช้เห็น
        label =
          row.productTypeCode === UNSPECIFIED_TYPE_CODE
            ? UNSPECIFIED_TYPE_LABEL
            : (typeNameByCode?.get(row.productTypeCode) ?? row.productTypeCode);
        break;
      case "sku":
        key = row.sku;
        label = `${row.sku} — ${row.productName}`;
        break;
    }
    const entry = map.get(key) ?? { key, label, metrics: emptyMetrics() };
    entry.metrics = addRow(entry.metrics, row);
    map.set(key, entry);
  }

  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// Phase R1 — Monthly Sales Chart: เติมเดือนที่ไม่มีข้อมูล (getSalesByGroup คืนมาแค่เดือน
// ที่มียอดจริงเท่านั้น) ให้ครบ ม.ค.-ธ.ค. เสมอ ด้วยยอด 0 — Pure Function ไม่แตะ DB
// เพื่อ unit test ได้ตรงๆ, Reuse getSalesByGroup(..., "month") เดิม ไม่มี Query ใหม่
export const THAI_MONTH_LABELS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export type MonthlySalesPoint = { month: number; label: string; net: number };

export function fillYearMonths(year: number, groups: GroupResult[]): MonthlySalesPoint[] {
  const byKey = new Map(groups.map((g) => [g.key, g]));
  return Array.from({ length: 12 }, (_, i) => {
    const monthNum = i + 1;
    const key = `${year}-${String(monthNum).padStart(2, "0")}`;
    return { month: monthNum, label: THAI_MONTH_LABELS[i], net: byKey.get(key)?.metrics.net ?? 0 };
  });
}

/** ปี (ค.ศ.) ที่มีเอกสารอยู่จริงอย่างน้อย 1 ใบ — ใช้ประกอบ Year Selector เสมอรวมปีปัจจุบัน */
export async function getAvailableSalesYears(): Promise<number[]> {
  const agg = await db.invoice.aggregate({ _min: { invoiceDate: true } });
  const currentYear = new Date().getFullYear();
  const earliestYear = agg._min.invoiceDate?.getFullYear() ?? currentYear;
  const years: number[] = [];
  for (let y = currentYear; y >= Math.min(earliestYear, currentYear); y--) years.push(y);
  return years;
}

// ==========================================================================
// Dashboard Chart Redesign — Sales Growth (MoM %) — Reuse getSalesByGroup(..., "month")
// เดิมทุกประการ ไม่มี Query/Sales SOT ใหม่ — เพิ่มแค่ Query เดียวเพื่อดึงยอด ธ.ค. ปีก่อน
// (สำหรับเทียบ ม.ค. ของปีที่เลือก) โดย Reuse getSalesByGroup ตัวเดิมเป๊ะ
// ==========================================================================

/** ยอดขาย (Net) เดือน ธ.ค. ของปีก่อนหน้า (year - 1) — ใช้เป็นฐานเทียบ ม.ค. ของปีที่เลือก
 * เท่านั้น ไม่มี Endpoint/Query ใหม่ — Reuse getSalesByGroup เดิม, คืน 0 ถ้าไม่มีข้อมูล
 * (เช่น ปีที่เลือกเป็นปีแรกที่มีข้อมูลในระบบ) */
export async function getPreviousDecemberNet(year: number): Promise<number> {
  const groups = await getSalesByGroup(
    { dateFrom: new Date(year - 1, 11, 1), dateTo: new Date(year - 1, 11, 31) },
    "month"
  );
  return groups[0]?.metrics.net ?? 0;
}

// Pure Function ล้วนๆ (ไม่แตะ DB) — คำนวณ MoM % จาก MonthlySalesPoint[] ที่มีอยู่แล้ว
// (fillYearMonths) + ยอด ธ.ค. ปีก่อนสำหรับ ม.ค. — Unit Test ได้ตรงๆ ไม่ต้องพึ่ง DB
// สูตร ((เดือนนี้-เดือนก่อน)/เดือนก่อน)×100 — Edge Case ตามที่อนุมัติ:
//  - เดือนก่อน=0 และเดือนนี้=0 → kind "flat", 0%
//  - เดือนก่อน=0 แต่เดือนนี้>0 → ห้ามหาร 0/Infinity → kind "new" (ไม่มีค่า % ที่มีความหมาย)
//  - อื่นๆ → kind "pct" คำนวณปกติ (positive/negative ตามเครื่องหมาย)
export type SalesGrowthPoint =
  | { month: number; label: string; kind: "pct"; value: number }
  | { month: number; label: string; kind: "flat" }
  | { month: number; label: string; kind: "new" };

export function computeSalesGrowth(monthlyData: MonthlySalesPoint[], previousDecemberNet: number): SalesGrowthPoint[] {
  return monthlyData.map((point, i) => {
    const prevNet = i === 0 ? previousDecemberNet : monthlyData[i - 1].net;
    const currNet = point.net;
    if (prevNet === 0 && currNet === 0) {
      return { month: point.month, label: point.label, kind: "flat" };
    }
    if (prevNet === 0) {
      return { month: point.month, label: point.label, kind: "new" };
    }
    return { month: point.month, label: point.label, kind: "pct", value: ((currNet - prevNet) / prevNet) * 100 };
  });
}

// ==========================================================================
// Phase B: Top Products ระดับ Model (ข้อ 4-5)
// แยกจาก fetchRows/getSalesByGroup เดิมเพราะต้อง join Product→ProductModel และ
// carry productId/modelId/size ที่ fetchRows เดิมไม่มี — ไม่แก้ fetchRows เดิมเพื่อ
// ไม่กระทบ /reports หน้าทั่วไปที่ใช้อยู่แล้ว
// ==========================================================================

export type ProductModelGroupResult = {
  // Owner UAT — ข้อ 1: Key มี Prefix บอกชนิดเสมอ — "model:{id}" (ProductModel จริง),
  // "family:{id}" (Product ที่เป็น Size Family Anchor ของตัวเอง — ไม่ต้องพึ่ง ProductModel
  // อีกต่อไป), "standalone:{id}" (Product เดี่ยว ไม่มี Size Family เลย ไม่มี Drill-down)
  key: string;
  label: string;
  kind: "model" | "family" | "standalone";
  metrics: Metrics;
};

type ProductRow = {
  quantity: number;
  gross: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
  productId: string;
  modelId: string | null;
  modelName: string | null;
  // Owner UAT — ข้อ 1: Product ที่เป็น Size Family Anchor ของตัวเอง (ไม่ผ่าน ProductModel)
  // — familyProductId คือ Root ของ Family นี้เสมอ (Parent ถ้าแถวนี้เป็น Variant, หรือ
  // ตัวเองถ้าแถวนี้คือ Anchor โดยตรง — เกิดได้น้อยมากเพราะ Anchor ไม่โผล่ใน Search แล้ว
  // แต่เอกสารเก่าก่อนหน้านี้อาจอ้างอิงถึงตรงๆ ได้ ต้อง Backward Compatible) — ไม่มี Family
  // เลย (Product เดี่ยวจริงๆ) = null ทั้งคู่ ห้าม Parse ชื่อสินค้าเพื่อหา Family เด็ดขาด
  familyProductId: string | null;
  familyProductName: string | null;
  productName: string;
  // Size ที่ใช้ report/drill-down: เอา sizeSnapshot (ค่า ณ วันที่ขาย) ก่อนเสมอถ้ามี
  // เอกสารเก่าก่อน Phase C ที่ snapshot เป็น null ถึงจะ fallback ไปใช้ Product.size
  // ปัจจุบันแทน (เป็นมุมมองสรุปรายงาน ไม่ใช่เอกสารที่ต้องคงสภาพย้อนหลัง)
  size: string | null;
};

async function fetchProductRows(filters: ReportFilters): Promise<ProductRow[]> {
  const items = await db.invoiceItem.findMany({
    where: {
      skuSnapshot: filters.sku,
      invoice: {
        status: SALES_SOT_STATUS,
        invoiceDate: { gte: filters.dateFrom, lte: filters.dateTo },
        customerId: filters.customerId,
        branchId: filters.branchId,
        productTypeCode: filters.productTypeCode,
      },
    },
    include: { product: { include: { model: true, parentProduct: true } } },
  });

  return items.map((item) => {
    const p = item.product;
    // Owner UAT — ข้อ 1: Family Root คำนวณจาก FK ล้วนๆ — parentProduct ก่อน (แถวนี้เป็น
    // Variant), ไม่งั้นเช็คว่าแถวนี้เองเป็น Anchor ไหม (pricePerFoot ไม่ว่าง), ไม่งั้นไม่มี
    // Family เลย — ไม่มีการ Parse ชื่อสินค้าที่ไหนเลยสักจุด
    const familyProductId = p.parentProduct?.id ?? (p.pricePerFoot != null ? p.id : null);
    const familyProductName = p.parentProduct?.name ?? (p.pricePerFoot != null ? p.name : null);
    return {
      quantity: Number(item.quantity),
      gross: Number(item.grossAmount),
      // R12 — เหมือน fetchRows ด้านบน: Net เชิงสถิติหักส่วนลดกลุ่มเสมอ
      discount: Number(item.statDiscountAmount),
      net: Number(item.grossAmount) - Number(item.statDiscountAmount),
      vat: Number(item.vatAmount),
      total: Number(item.totalAmount),
      productId: item.productId,
      modelId: p.modelId,
      modelName: p.model?.name ?? null,
      familyProductId,
      familyProductName,
      productName: item.productNameSnapshot,
      size: item.sizeSnapshot ?? p.size ?? null,
    };
  });
}

// Owner UAT — ข้อ 1: Key+Label+Kind เดียวกันเป๊ะ ใช้ทั้งใน getTopProductModels (Group) และ
// getProductModelSizeBreakdown (Drill-down Filter) กันไม่ให้ 2 จุด Derive คนละแบบเพี้ยนกัน
function resolveProductFamily(row: ProductRow): { key: string; label: string; kind: "model" | "family" | "standalone" } {
  if (row.modelId) return { key: `model:${row.modelId}`, label: row.modelName ?? row.productName, kind: "model" };
  if (row.familyProductId) return { key: `family:${row.familyProductId}`, label: row.familyProductName ?? row.productName, kind: "family" };
  return { key: `standalone:${row.productId}`, label: row.productName, kind: "standalone" };
}

function addMetrics(
  m: Metrics,
  row: { quantity: number; gross: number; discount: number; net: number; vat: number; total: number }
): Metrics {
  return {
    quantity: m.quantity + row.quantity,
    gross: m.gross + row.gross,
    discount: m.discount + row.discount,
    net: m.net + row.net,
    vat: m.vat + row.vat,
    total: m.total + row.total,
  };
}

/** ข้อ 4: Top Products ระดับ Model — รวม SKU/Size ทุกตัวของ Model เดียวกันเข้าด้วยกัน
 * Product ที่ยังไม่ได้ assign Model จะแยกเป็นรายการของตัวเอง (standalone fallback)
 * ตามที่อนุมัติ ไม่ error ไม่หายไปจาก Dashboard — ห้าม string-parse ชื่อสินค้าเพื่อเดา
 * Model เด็ดขาด ใช้ Product.modelId ที่เป็น Human-assigned เท่านั้น */
export async function getTopProductModels(filters: ReportFilters, limit = 10): Promise<ProductModelGroupResult[]> {
  const rows = await fetchProductRows(filters);
  const map = new Map<string, ProductModelGroupResult>();

  for (const row of rows) {
    const { key, label, kind } = resolveProductFamily(row);
    const entry = map.get(key) ?? { key, label, kind, metrics: emptyMetrics() };
    entry.metrics = addMetrics(entry.metrics, row);
    map.set(key, entry);
  }

  return [...map.values()].sort((a, b) => b.metrics.net - a.metrics.net).slice(0, limit);
}

/** ข้อ 5: Drill-down ของ 1 Family (ProductModel หรือ Product Anchor) แยกยอดตาม Size —
 * รับ key แบบเดียวกับที่ getTopProductModels คืนมาเป๊ะ ("model:{id}" หรือ "family:{id}")
 * ใช้ Date Filter เดียวกับ Dashboard เสมอ (รับ filters ตรงจาก caller ไม่มี default เป็น
 * All-time) — SUM(bySize) ต้องเท่ากับ total เสมอเพราะกรองด้วย Key เดียวกับที่ Group ไว้แล้ว
 * ไม่ได้คำนวณแยกคนละทาง */
export async function getProductModelSizeBreakdown(filters: ReportFilters, key: string) {
  const rows = await fetchProductRows(filters);
  const relevant = rows.filter((r) => resolveProductFamily(r).key === key);

  const map = new Map<string, Metrics>();
  for (const row of relevant) {
    const sizeKey = row.size ?? "ไม่ระบุขนาด";
    map.set(sizeKey, addMetrics(map.get(sizeKey) ?? emptyMetrics(), row));
  }

  const bySize = [...map.entries()].map(([size, metrics]) => ({ size, metrics })).sort((a, b) => b.metrics.net - a.metrics.net);
  const total = relevant.reduce((m, r) => addMetrics(m, r), emptyMetrics());

  return { bySize, total };
}

/** ข้อ 40: Branch Report — Product Mix แยกตาม Type ในแต่ละสาขา */
export async function getBranchProductMix(filters: ReportFilters) {
  const rows = await fetchRows(filters);
  const map = new Map<string, { branchName: string; byType: Map<string, Metrics>; total: Metrics }>();

  for (const row of rows) {
    // Owner UAT Fix Batch 1 — ข้อ 3: ไม่มีสาขา → รวมกลุ่มเดียวกับ getSalesByGroup(..., "branch")
    const branchKey = row.branchId ?? UNSPECIFIED_BRANCH_KEY;
    const branchLabel = row.branchName ?? UNSPECIFIED_BRANCH_LABEL;
    const entry = map.get(branchKey) ?? { branchName: branchLabel, byType: new Map(), total: emptyMetrics() };
    const typeMetrics = entry.byType.get(row.productTypeCode) ?? emptyMetrics();
    entry.byType.set(row.productTypeCode, addRow(typeMetrics, row));
    entry.total = addRow(entry.total, row);
    map.set(branchKey, entry);
  }

  return [...map.entries()]
    .map(([branchId, v]) => ({
      branchId,
      branchName: v.branchName,
      total: v.total,
      byType: [...v.byType.entries()]
        .map(([code, metrics]) => ({ code, metrics }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.branchName.localeCompare(b.branchName));
}

/** ข้อ 41: Dashboard — สรุปยอด + Top 10 Customer/Product */
export async function getDashboard(filters: ReportFilters) {
  const summary = await getSalesSummary(filters);
  const salesByType = await getSalesByGroup(filters, "productType");
  const byCustomer = await getSalesByGroup(filters, "customer");

  // Dashboard ต้องแสดงทุก ProductType ที่ Active อยู่ใน Master แม้ยอดขายช่วงนั้นเป็น 0
  // (ไม่ใช่แค่ Type ที่มียอดขายจริงเหมือน getSalesByGroup ทั่วไป) เรียงตาม sortOrder —
  // ต่างจาก /reports ทั่วไปที่ควรโชว์เฉพาะที่มีข้อมูลจริงเท่านั้น จึงไม่แก้พฤติกรรม
  // ของ getSalesByGroup เอง แต่ประกอบ list นี้แยกเฉพาะที่นี่
  const activeTypes = await db.productType.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { code: true, name: true },
  });
  const salesByTypeCode = new Map(salesByType.map((g) => [g.key, g]));
  const byType: GroupResult[] = activeTypes.map((t) => salesByTypeCode.get(t.code) ?? { key: t.code, label: t.name, metrics: emptyMetrics() });

  // R4 — "GEN" (ไม่ระบุประเภท) ไม่ใช่ ProductType Master จริง จึงไม่อยู่ใน activeTypes
  // ข้างบน — ต่างจาก Type จริงตรงที่ "ไม่ต้องโชว์การ์ดค้างไว้ตอนยอด 0" (ไม่มี Master ให้
  // อ้างอิงว่า "ควรมีอยู่เสมอ") แต่ถ้ามียอดขายจริงในช่วงนี้ ต้องไม่หายไปจาก Dashboard เงียบๆ
  const genGroup = salesByTypeCode.get(UNSPECIFIED_TYPE_CODE);
  if (genGroup) byType.push(genGroup);

  // R6 Phase D — ข้อ G: Dashboard ระดับแรกเปลี่ยนจาก Card กลุ่มส่วนลด → Card ลูกค้า
  // แสดงทุกบริษัทที่มียอดตาม Sales SOT ในช่วงวันที่เลือก (ไม่ Cap 10 เหมือน topCustomers
  // เดิมที่ยังใช้กับ List "Top 10 ลูกค้า" แยกต่างหากด้านล่างอยู่)
  const customerCards = [...byCustomer].sort((a, b) => b.metrics.net - a.metrics.net);
  const topCustomers = customerCards.slice(0, 10);
  const topProducts = await getTopProductModels(filters, 10);

  return { summary, byType, customerCards, topCustomers, topProducts };
}

// ==========================================================================
// R11 (2026-08-27) — รายงานแบบเรียงรายใบ (Flat List) + ยอดฝั่งใบกำกับภาษี
// SOT เดียวกับระบบเสมอ: นับเฉพาะเอกสารที่ผ่าน PRINTED Checkpoint (พิมพ์กระดาษ 9×11
// ยืนยันแล้ว) — Owner เคาะชัดว่าใบกำกับภาษีก็ใช้เกณฑ์เดียวกัน
// ==========================================================================

export type PrintedInvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customerName: string;
  gross: number;
  discount: number;
  grandTotal: number;
};

/** 8.1 — รายการใบส่งของชั่วคราวที่พิมพ์แล้ว เรียงตามวันที่/เลขที่ (ไม่แยกบริษัท) */
export async function fetchPrintedInvoiceList(filters: ReportFilters): Promise<PrintedInvoiceRow[]> {
  const rows = await db.invoice.findMany({
    where: {
      status: "PRINTED",
      invoiceDate: { gte: filters.dateFrom, lte: filters.dateTo },
      customerId: filters.customerId,
      branchId: filters.branchId,
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      customerNameSnapshot: true,
      grossAmount: true,
      discountAmount: true,
      grandTotal: true,
    },
    orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: r.invoiceDate,
    customerName: r.customerNameSnapshot,
    gross: Number(r.grossAmount),
    discount: Number(r.discountAmount),
    grandTotal: Number(r.grandTotal),
  }));
}

export type PrintedTaxInvoiceRow = {
  id: string;
  taxInvoiceNumber: string;
  taxInvoiceDate: Date;
  customerName: string;
  valueAmount: number; // มูลค่าก่อน VAT (ฐานภาษี)
  vatAmount: number;
  netAmount: number; // ยอดรวม (รวม VAT)
};

/** 8.2 — รายงานใบกำกับภาษี (ภาษีขาย): ใบที่พิมพ์แล้ว เรียงตามวันที่/เลขที่ (ไม่แยกบริษัท) */
export async function fetchPrintedTaxInvoiceList(filters: { dateFrom?: Date; dateTo?: Date }): Promise<PrintedTaxInvoiceRow[]> {
  const rows = await db.taxInvoice.findMany({
    where: { status: "PRINTED", taxInvoiceDate: { gte: filters.dateFrom, lte: filters.dateTo } },
    select: {
      id: true,
      taxInvoiceNumber: true,
      taxInvoiceDate: true,
      customerNameSnapshot: true,
      valueAmount: true,
      vatAmount: true,
      netAmount: true,
    },
    orderBy: [{ taxInvoiceDate: "asc" }, { taxInvoiceNumber: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    taxInvoiceNumber: r.taxInvoiceNumber,
    taxInvoiceDate: r.taxInvoiceDate,
    customerName: r.customerNameSnapshot,
    valueAmount: Number(r.valueAmount),
    vatAmount: Number(r.vatAmount),
    netAmount: Number(r.netAmount),
  }));
}

export type TaxInvoiceSummary = { count: number; valueAmount: number; vatAmount: number; netAmount: number };

/** ยอดรวมฝั่งใบกำกับภาษี (PRINTED เท่านั้น) — Dashboard Card "จากใบกำกับภาษี":
 * ยอดขาย = Σ ยอดรวม (รวม VAT) / ยอดสุทธิ = Σ มูลค่าก่อน VAT — คนละมุมมองกับฝั่งใบส่งของ
 * โดยเจตนา ห้ามนำสองฝั่งมาบวกกัน (ใบกำกับโหมด AUTO ยอดซ้ำกับใบส่งของ) */
export async function getTaxInvoiceSummary(filters: { dateFrom?: Date; dateTo?: Date }): Promise<TaxInvoiceSummary> {
  const rows = await fetchPrintedTaxInvoiceList(filters);
  return rows.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      valueAmount: acc.valueAmount + r.valueAmount,
      vatAmount: acc.vatAmount + r.vatAmount,
      netAmount: acc.netAmount + r.netAmount,
    }),
    { count: 0, valueAmount: 0, vatAmount: 0, netAmount: 0 }
  );
}
