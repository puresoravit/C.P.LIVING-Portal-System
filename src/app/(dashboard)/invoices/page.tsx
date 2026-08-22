import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { startOfMonth, endOfCurrentMonth } from "@/lib/date-utils";
import { toQueryObject } from "@/lib/search-params";
import { buildStatusTabCounts } from "@/lib/status-tab-counts";
import { StatusTabs } from "@/components/status-tabs";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { displayProductTypeCode } from "@/lib/order-preview";
import { SearchInputWithClear } from "@/components/search-input-with-clear";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-blue-100 text-blue-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};
// ข้อกำหนด: CONFIRMED และ PRINTED ต้องนับแยกกัน ห้ามนับซ้ำ — เป็น Tab แยกกันตรงๆ
const TAB_ORDER = ["DRAFT", "CONFIRMED", "PRINTED", "CANCELLED"];
const PAGE_SIZE = 25;

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type SearchParams = { status?: string; q?: string; dateFrom?: string; dateTo?: string; page?: string };

export default async function InvoicesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const dateFrom = searchParams.dateFrom || startOfMonth();
  const dateTo = searchParams.dateTo || endOfCurrentMonth();
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const baseWhere = {
    invoiceDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" as const } },
            { customerNameSnapshot: { contains: q, mode: "insensitive" as const } },
            { customer: { code: { contains: q, mode: "insensitive" as const } } },
            { order: { orderNumber: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [statusGroups, totalCount, invoices] = await Promise.all([
    db.invoice.groupBy({ by: ["status"], where: baseWhere, _count: true }),
    db.invoice.count({ where: baseWhere }),
    db.invoice.findMany({
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
      <h1 className="text-lg font-semibold mb-1">ใบส่งของชั่วคราว (Invoice)</h1>
      <p className="text-sm text-gray-500 mb-4">
        แตกอัตโนมัติจาก Order ตอน Confirm — แยกใบตามกลุ่มส่วนลด (Type) เสมอ
      </p>

      <form className="bg-white border rounded-lg p-4 grid grid-cols-4 gap-3 mb-4 items-end">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ค้นหา (เลขที่/ชื่อลูกค้า/รหัสลูกค้า/เลขที่ Order)</label>
          <SearchInputWithClear
            defaultValue={searchParams.q}
            placeholder="เช่น INV-A-202608 หรือ บริษัท..."
            basePath="/invoices"
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

      <StatusTabs tabs={tabs} activeKey={status ?? "all"} basePath="/invoices" preserveParams={preserveParamsNoStatus} />

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
              <th className="px-4 py-2 font-medium text-right">ยอดสุทธิ</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <a href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
                    {inv.invoiceNumber}
                  </a>
                </td>
                <td className="px-4 py-2">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2">{inv.customerNameSnapshot}</td>
                <td className="px-4 py-2">{displayProductTypeCode(inv.productTypeCode)}</td>
                <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={inv.status} config={STATUS_LABEL} />
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบ Invoice ที่ตรงกับเงื่อนไข
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} totalCount={currentCount} basePath="/invoices" preserveParams={preserveParams} />
    </div>
  );
}
