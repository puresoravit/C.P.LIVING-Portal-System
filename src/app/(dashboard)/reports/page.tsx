import { db } from "@/lib/db";
import { getSalesByGroup, getSalesSummary, fetchPrintedInvoiceList, fetchPrintedTaxInvoiceList, type GroupKey } from "@/lib/reports";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

const GROUP_TABS: { key: GroupKey; label: string }[] = [
  { key: "month", label: "ตามเดือน" },
  { key: "customer", label: "ตามลูกค้า" },
  { key: "branch", label: "ตามสาขา" },
  { key: "productType", label: "ตามกลุ่มส่วนลด" },
  { key: "sku", label: "ตามสินค้า (รหัสสินค้า)" },
];

type SearchParams = {
  groupBy?: string;
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  branchId?: string;
  productTypeCode?: string;
  sort?: string;
};

export default async function ReportsPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "report.view")) redirect("/");

  const groupBy = (searchParams.groupBy as GroupKey) || "month";

  const filters = {
    dateFrom: searchParams.dateFrom ? new Date(searchParams.dateFrom) : undefined,
    dateTo: searchParams.dateTo ? new Date(searchParams.dateTo) : undefined,
    customerId: searchParams.customerId || undefined,
    branchId: searchParams.branchId || undefined,
    productTypeCode: searchParams.productTypeCode || undefined,
  };

  const [customers, branches, productTypes, summary, groups, invoiceList, taxInvoiceList] = await Promise.all([
    db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } }),
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getSalesSummary(filters),
    getSalesByGroup(filters, groupBy),
    // R11 — ข้อ 8: รายการเรียงรายใบ (PRINTED เท่านั้น — SOT เดิม)
    fetchPrintedInvoiceList(filters),
    fetchPrintedTaxInvoiceList({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
  ]);
  const invTotals = invoiceList.reduce(
    (a, r) => ({ gross: a.gross + r.gross, discount: a.discount + r.discount, grandTotal: a.grandTotal + r.grandTotal }),
    { gross: 0, discount: 0, grandTotal: 0 }
  );
  const taxTotals = taxInvoiceList.reduce(
    (a, r) => ({ value: a.value + r.valueAmount, vat: a.vat + r.vatAmount, net: a.net + r.netAmount }),
    { value: 0, vat: 0, net: 0 }
  );

  const sortedGroups =
    groupBy === "sku" && searchParams.sort === "qty"
      ? [...groups].sort((a, b) => b.metrics.quantity - a.metrics.quantity)
      : groupBy === "sku" && searchParams.sort === "value"
      ? [...groups].sort((a, b) => b.metrics.net - a.metrics.net)
      : groups;

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-4">รายงานยอดขาย</h1>

      <form className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <input type="hidden" name="groupBy" value={groupBy} />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่เริ่ม</label>
          <input name="dateFrom" type="date" defaultValue={searchParams.dateFrom} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่สิ้นสุด</label>
          <input name="dateTo" type="date" defaultValue={searchParams.dateTo} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า</label>
          <select name="customerId" defaultValue={searchParams.customerId ?? ""} className="w-full border rounded px-3 py-1.5 text-sm">
            <option value="">ทั้งหมด</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">สาขา</label>
          <select name="branchId" defaultValue={searchParams.branchId ?? ""} className="w-full border rounded px-3 py-1.5 text-sm">
            <option value="">ทั้งหมด</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">กลุ่มส่วนลด</label>
          <select name="productTypeCode" defaultValue={searchParams.productTypeCode ?? ""} className="w-full border rounded px-3 py-1.5 text-sm">
            <option value="">ทั้งหมด</option>
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.code}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-1 sm:col-span-2 flex items-end">
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
            ค้นหา
          </button>
        </div>
      </form>

      {/* R11 — ข้อ 8.1: รายงานยอดขาย (จากใบส่งของชั่วคราว) — เรียงรายใบตามวันที่/เลข INV
          ไม่แยกบริษัท (PRINTED เท่านั้น — SOT เดิม) ตามฟอร์แมตที่ Owner กำหนด */}
      <h2 className="text-base font-semibold mb-2">8.1 รายงานยอดขาย (จากใบส่งของชั่วคราว)</h2>
      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">เลขที่ INV</th>
                <th className="px-4 py-2 font-medium">วันที่</th>
                <th className="px-4 py-2 font-medium">ชื่อบริษัท</th>
                <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
                <th className="px-4 py-2 font-medium text-right">ส่วนลด</th>
                <th className="px-4 py-2 font-medium text-right">สุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {invoiceList.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 font-mono">
                    <a href={`/invoices/${r.id}`} className="text-blue-600 hover:underline">
                      {r.invoiceNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2">{r.invoiceDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2">{r.customerName}</td>
                  <td className="px-4 py-2 text-right">{money(r.gross)}</td>
                  <td className="px-4 py-2 text-right">{money(r.discount)}</td>
                  <td className="px-4 py-2 text-right">{money(r.grandTotal)}</td>
                </tr>
              ))}
              {invoiceList.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    ไม่มีใบส่งของชั่วคราวที่พิมพ์แล้วในช่วงวันที่นี้
                  </td>
                </tr>
              )}
            </tbody>
            {invoiceList.length > 0 && (
              <tfoot>
                <tr className="border-t bg-gray-50 font-medium">
                  <td colSpan={3} className="px-4 py-2 text-right">
                    รวม ({invoiceList.length} ใบ)
                  </td>
                  <td className="px-4 py-2 text-right">{money(invTotals.gross)}</td>
                  <td className="px-4 py-2 text-right">{money(invTotals.discount)}</td>
                  <td className="px-4 py-2 text-right">{money(invTotals.grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* สรุป/วิเคราะห์แยกมุมมอง (ของเดิมทั้งหมด — อยู่ใต้หัวข้อ 8.1) */}
      {/* Mobile Audit — KPI 4 ใบ: มือถือเรียง 2×2 (1 คอลัมน์ยาวเกิน, 4 คอลัมน์บีบเกิน) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="จำนวนที่ขาย" value={summary.quantity.toLocaleString("th-TH")} />
        <SummaryCard label="ยอดขาย (จำนวนเงิน)" value={`${money(summary.gross)} บาท`} />
        <SummaryCard label="ส่วนลดรวม" value={`${money(summary.discount)} บาท`} />
        <SummaryCard label="ยอดสุทธิ (Net)" value={`${money(summary.net)} บาท`} highlight />
      </div>

      <div className="flex gap-1 mb-3 border-b overflow-x-auto">
        {GROUP_TABS.map((tab) => (
          <a
            key={tab.key}
            href={`/reports?${new URLSearchParams({ ...searchParamsToObject(searchParams), groupBy: tab.key }).toString()}`}
            className={`px-3 py-2 text-sm border-b-2 ${
              groupBy === tab.key ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {groupBy === "sku" && (
        <div className="mb-3 text-sm">
          เรียงตาม:{" "}
          <a href={`/reports?${new URLSearchParams({ ...searchParamsToObject(searchParams), groupBy, sort: "qty" }).toString()}`} className="text-blue-600 hover:underline mr-3">
            ขายมากที่สุด
          </a>
          <a href={`/reports?${new URLSearchParams({ ...searchParamsToObject(searchParams), groupBy, sort: "value" }).toString()}`} className="text-blue-600 hover:underline">
            ยอดขายสูงที่สุด
          </a>
        </div>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">{GROUP_TABS.find((t) => t.key === groupBy)?.label}</th>
              <th className="px-4 py-2 font-medium text-right">จำนวน</th>
              <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
              <th className="px-4 py-2 font-medium text-right">ส่วนลด</th>
              <th className="px-4 py-2 font-medium text-right">Net</th>
              <th className="px-4 py-2 font-medium text-right">VAT</th>
            </tr>
          </thead>
          <tbody>
            {sortedGroups.map((g) => (
              <tr key={g.key} className="border-t">
                <td className="px-4 py-2">
                  {groupBy === "customer" ? (
                    <a href={`/reports?groupBy=branch&customerId=${g.key}`} className="text-blue-600 hover:underline">
                      {g.label}
                    </a>
                  ) : (
                    g.label
                  )}
                </td>
                <td className="px-4 py-2 text-right">{g.metrics.quantity.toLocaleString("th-TH")}</td>
                <td className="px-4 py-2 text-right">{money(g.metrics.gross)}</td>
                <td className="px-4 py-2 text-right">{money(g.metrics.discount)}</td>
                <td className="px-4 py-2 text-right">{money(g.metrics.net)}</td>
                <td className="px-4 py-2 text-right">{money(g.metrics.vat)}</td>
              </tr>
            ))}
            {sortedGroups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบข้อมูลตามเงื่อนไขที่เลือก
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <a
          href={`/api/reports/export/summary?${new URLSearchParams({ ...searchParamsToObject(searchParams), groupBy }).toString()}`}
          className="text-sm text-blue-600 hover:underline"
        >
          Export Summary (Excel)
        </a>
        <a
          href={`/api/reports/export/raw?${new URLSearchParams(searchParamsToObject(searchParams)).toString()}`}
          className="text-sm text-blue-600 hover:underline"
        >
          Export Raw Data (Excel)
        </a>
        <a href="/reports/branches" className="text-sm text-blue-600 hover:underline">
          ดู Product Mix แยกรายสาขา →
        </a>
      </div>

      {/* R11 — ข้อ 8.2: รายงานใบกำกับภาษี (ภาษีขาย) — เรียงรายใบตามวันที่/เลข TX ไม่แยก
          บริษัท (PRINTED เท่านั้น ตามที่ Owner เคาะ) — ยอดฝั่งนี้ห้ามบวกรวมกับ 8.1
          (ใบโหมด AUTO ยอดซ้ำกับใบส่งของโดยธรรมชาติ — เป็นคนละมุมมองกัน) */}
      <h2 className="text-base font-semibold mt-8 mb-2">8.2 รายงานใบกำกับภาษี (ภาษีขาย)</h2>
      <p className="text-xs text-gray-500 mb-2">
        ช่วงวันที่ตามตัวกรองด้านบน — นับเฉพาะใบที่พิมพ์แล้ว (9×11) · ตัวกรองลูกค้า/สาขา/กลุ่มส่วนลดไม่มีผลกับตารางนี้
      </p>
      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">เลขที่ TX</th>
                <th className="px-4 py-2 font-medium">วันที่</th>
                <th className="px-4 py-2 font-medium">ชื่อลูกค้า</th>
                <th className="px-4 py-2 font-medium text-right">มูลค่าก่อน VAT</th>
                <th className="px-4 py-2 font-medium text-right">VAT</th>
                <th className="px-4 py-2 font-medium text-right">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {taxInvoiceList.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 font-mono">
                    <a href={`/tax-invoices/${r.id}`} className="text-blue-600 hover:underline">
                      {r.taxInvoiceNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2">{r.taxInvoiceDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2">{r.customerName}</td>
                  <td className="px-4 py-2 text-right">{money(r.valueAmount)}</td>
                  <td className="px-4 py-2 text-right">{money(r.vatAmount)}</td>
                  <td className="px-4 py-2 text-right">{money(r.netAmount)}</td>
                </tr>
              ))}
              {taxInvoiceList.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    ไม่มีใบกำกับภาษีที่พิมพ์แล้วในช่วงวันที่นี้
                  </td>
                </tr>
              )}
            </tbody>
            {taxInvoiceList.length > 0 && (
              <tfoot>
                <tr className="border-t bg-gray-50 font-medium">
                  <td colSpan={3} className="px-4 py-2 text-right">
                    รวม ({taxInvoiceList.length} ใบ)
                  </td>
                  <td className="px-4 py-2 text-right">{money(taxTotals.value)}</td>
                  <td className="px-4 py-2 text-right">{money(taxTotals.vat)}</td>
                  <td className="px-4 py-2 text-right">{money(taxTotals.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function searchParamsToObject(sp: SearchParams): Record<string, string> {
  const obj: Record<string, string> = {};
  if (sp.dateFrom) obj.dateFrom = sp.dateFrom;
  if (sp.dateTo) obj.dateTo = sp.dateTo;
  if (sp.customerId) obj.customerId = sp.customerId;
  if (sp.branchId) obj.branchId = sp.branchId;
  if (sp.productTypeCode) obj.productTypeCode = sp.productTypeCode;
  return obj;
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${highlight ? "bg-blue-50" : "bg-white border"}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-medium ${highlight ? "text-blue-700" : ""}`}>{value}</div>
    </div>
  );
}
