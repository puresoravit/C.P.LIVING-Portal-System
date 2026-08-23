import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { startOfMonth, endOfCurrentMonth, safeDateParam } from "@/lib/date-utils";
import { toQueryObject } from "@/lib/search-params";
import { buildStatusTabCounts } from "@/lib/status-tab-counts";
import { StatusTabs } from "@/components/status-tabs";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { SearchInputWithClear } from "@/components/search-input-with-clear";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};
// TaxInvoiceStatus enum ไม่มี DRAFT จริง — ไม่แสดง Tab "ร่าง"
const TAB_ORDER = ["CONFIRMED", "CANCELLED"];
const PAGE_SIZE = 25;

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type SearchParams = { status?: string; q?: string; dateFrom?: string; dateTo?: string; page?: string };

export default async function TaxInvoicesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "taxInvoice.create")) redirect("/");

  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const baseWhere = {
    taxInvoiceDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
    ...(q
      ? {
          OR: [
            { taxInvoiceNumber: { contains: q, mode: "insensitive" as const } },
            { customerNameSnapshot: { contains: q, mode: "insensitive" as const } },
            { customer: { code: { contains: q, mode: "insensitive" as const } } },
            { referenceInvoice: { invoiceNumber: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [statusGroups, totalCount, taxInvoices] = await Promise.all([
    db.taxInvoice.groupBy({ by: ["status"], where: baseWhere, _count: true }),
    db.taxInvoice.count({ where: baseWhere }),
    db.taxInvoice.findMany({
      where: { ...baseWhere, ...(status ? { status: status as any } : {}) },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const counts = buildStatusTabCounts(
    statusGroups.map((g) => ({ status: g.status, count: g._count })),
    TAB_ORDER
  );
  const tabs = [
    { key: "all", label: "ทั้งหมด", count: totalCount },
    ...TAB_ORDER.map((key) => ({ key, label: STATUS_LABEL[key].label, count: counts[key] })),
  ];

  const currentCount = status ? counts[status] ?? 0 : totalCount;
  const totalPages = Math.max(1, Math.ceil(currentCount / PAGE_SIZE));
  const preserveParams = toQueryObject({ q: searchParams.q, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo, status: searchParams.status });
  const preserveParamsNoStatus = toQueryObject({ q: searchParams.q, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo });
  // Owner UAT Fix Batch 3 — ข้อ 5: ปุ่ม × ล้างเฉพาะ q — คง dateFrom/dateTo/status เดิมไว้
  const preserveParamsNoQ = toQueryObject({ dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo, status: searchParams.status });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">ใบกำกับภาษี</h1>
        <a
          href="/tax-invoices/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          + สร้างใบกำกับภาษี (เลือกรายการเอง)
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        ส่วนใหญ่ลูกค้าจะแจ้งรายการ/ยอดเองว่าต้องการใบกำกับภาษีเท่าไร — ใช้ปุ่มด้านบนสร้างแบบเลือกเอง
        หรือถ้าลูกค้าขอ VAT เต็ม 100% ของยอด ให้กด &quot;สร้างใบกำกับภาษีจากใบนี้&quot; จากหน้ารายละเอียด Invoice แทน
      </p>

      <form className="bg-white border rounded-lg p-4 grid grid-cols-4 gap-3 mb-4 items-end">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ค้นหา (เลขที่/ชื่อลูกค้า/รหัสลูกค้า/เลขที่ Invoice ต้นทาง)</label>
          <SearchInputWithClear
            defaultValue={searchParams.q}
            placeholder="เช่น TX-202608 หรือ บริษัท..."
            basePath="/tax-invoices"
            preserveParams={preserveParamsNoQ}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่เริ่ม</label>
          <input name="dateFrom" type="date" defaultValue={dateFrom} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่สิ้นสุด</label>
          <input name="dateTo" type="date" defaultValue={dateTo} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="col-span-4">
          <button className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded px-4 py-2">ค้นหา</button>
        </div>
      </form>

      <StatusTabs tabs={tabs} activeKey={status ?? "all"} basePath="/tax-invoices" preserveParams={preserveParamsNoStatus} />

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">อ้างอิง Invoice</th>
              <th className="px-4 py-2 font-medium text-right">มูลค่าสินค้า</th>
              <th className="px-4 py-2 font-medium text-right">VAT</th>
              <th className="px-4 py-2 font-medium text-right">สุทธิ</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {taxInvoices.map((tx) => (
              <tr key={tx.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <a href={`/tax-invoices/${tx.id}`} className="font-mono text-blue-600 hover:underline">
                    {tx.taxInvoiceNumber}
                  </a>
                </td>
                <td className="px-4 py-2">{tx.taxInvoiceDate.toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2">{tx.customerNameSnapshot}</td>
                <td className="px-4 py-2 text-gray-400">{tx.referenceInvoiceId ? "Auto" : "Manual"}</td>
                <td className="px-4 py-2 text-right">{money(tx.valueAmount)}</td>
                <td className="px-4 py-2 text-right">{money(tx.vatAmount)}</td>
                <td className="px-4 py-2 text-right">{money(tx.netAmount)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={tx.status} config={STATUS_LABEL} />
                </td>
              </tr>
            ))}
            {taxInvoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบใบกำกับภาษีที่ตรงกับเงื่อนไข
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} totalCount={currentCount} basePath="/tax-invoices" preserveParams={preserveParams} />
    </div>
  );
}
