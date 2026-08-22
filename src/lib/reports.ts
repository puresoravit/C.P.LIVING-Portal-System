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
  branchId: string;
  branchName: string;
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

async function fetchRows(filters: ReportFilters): Promise<Row[]> {
  const items = await db.invoiceItem.findMany({
    where: {
      skuSnapshot: filters.sku,
      invoice: {
        status: { not: "CANCELLED" },
        invoiceDate: { gte: filters.dateFrom, lte: filters.dateTo },
        customerId: filters.customerId,
        branchId: filters.branchId,
        productTypeCode: filters.productTypeCode,
      },
    },
    include: { invoice: true },
  });

  return items.map((item) => ({
    quantity: Number(item.quantity),
    gross: Number(item.grossAmount),
    discount: Number(item.discountAmount),
    net: Number(item.netAmount),
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
        key = row.branchId;
        label = row.branchName;
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
  key: string; // modelId ถ้า assign แล้ว, ไม่งั้น `product:${productId}` (standalone fallback)
  label: string;
  isModel: boolean;
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
        status: { not: "CANCELLED" },
        invoiceDate: { gte: filters.dateFrom, lte: filters.dateTo },
        customerId: filters.customerId,
        branchId: filters.branchId,
        productTypeCode: filters.productTypeCode,
      },
    },
    include: { product: { include: { model: true } } },
  });

  return items.map((item) => ({
    quantity: Number(item.quantity),
    gross: Number(item.grossAmount),
    discount: Number(item.discountAmount),
    net: Number(item.netAmount),
    vat: Number(item.vatAmount),
    total: Number(item.totalAmount),
    productId: item.productId,
    modelId: item.product.modelId,
    modelName: item.product.model?.name ?? null,
    productName: item.productNameSnapshot,
    size: item.sizeSnapshot ?? item.product.size ?? null,
  }));
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
    const key = row.modelId ?? `product:${row.productId}`;
    const label = row.modelName ?? row.productName;
    const entry = map.get(key) ?? { key, label, isModel: !!row.modelId, metrics: emptyMetrics() };
    entry.metrics = addMetrics(entry.metrics, row);
    map.set(key, entry);
  }

  return [...map.values()].sort((a, b) => b.metrics.net - a.metrics.net).slice(0, limit);
}

/** ข้อ 5: Drill-down ของ 1 Model แยกยอดตาม Size — ใช้ Date Filter เดียวกับ Dashboard
 * เสมอ (รับ filters ตรงจาก caller ไม่มี default เป็น All-time) */
export async function getProductModelSizeBreakdown(filters: ReportFilters, modelId: string) {
  const rows = await fetchProductRows(filters);
  const relevant = rows.filter((r) => r.modelId === modelId);

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
    const entry = map.get(row.branchId) ?? { branchName: row.branchName, byType: new Map(), total: emptyMetrics() };
    const typeMetrics = entry.byType.get(row.productTypeCode) ?? emptyMetrics();
    entry.byType.set(row.productTypeCode, addRow(typeMetrics, row));
    entry.total = addRow(entry.total, row);
    map.set(row.branchId, entry);
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

  const topCustomers = [...byCustomer].sort((a, b) => b.metrics.net - a.metrics.net).slice(0, 10);
  const topProducts = await getTopProductModels(filters, 10);

  return { summary, byType, topCustomers, topProducts };
}
