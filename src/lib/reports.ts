import { db } from "@/lib/db";

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

/** ข้อ 36: Group By เดือน/ลูกค้า/สาขา/ประเภทสินค้า/SKU */
export async function getSalesByGroup(filters: ReportFilters, groupBy: GroupKey): Promise<GroupResult[]> {
  const rows = await fetchRows(filters);
  const map = new Map<string, GroupResult>();

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
        label = `TYPE ${row.productTypeCode}`;
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

/** ข้อ 41: Dashboard — สรุปยอด + Top 5 Customer/Product */
export async function getDashboard(filters: ReportFilters) {
  const summary = await getSalesSummary(filters);
  const byType = await getSalesByGroup(filters, "productType");
  const byCustomer = await getSalesByGroup(filters, "customer");
  const byProduct = await getSalesByGroup(filters, "sku");

  const topCustomers = [...byCustomer].sort((a, b) => b.metrics.net - a.metrics.net).slice(0, 5);
  const topProducts = [...byProduct].sort((a, b) => b.metrics.net - a.metrics.net).slice(0, 5);

  return { summary, byType, topCustomers, topProducts };
}
