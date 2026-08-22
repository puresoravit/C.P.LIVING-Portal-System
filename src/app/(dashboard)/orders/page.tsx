import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { startOfMonth, endOfCurrentMonth } from "@/lib/date-utils";
import { toQueryObject } from "@/lib/search-params";
import { buildStatusTabCounts } from "@/lib/status-tab-counts";
import { sumActiveInvoiceTotal, deriveOrderPrintState } from "@/lib/order-doc-center";
import { displayProductTypeCode } from "@/lib/order-preview";
import { StatusTabs } from "@/components/status-tabs";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";

const ORDER_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};
// Invoice ในระบบนี้มี PRINTED เพิ่มมาจาก Order (ข้อ Doc-Center #9 — Tab ของหน้านี้ยึด
// Order Status เท่านั้น ไม่เอา Invoice Status มาปนกับ Parent — Map นี้ใช้แค่ระบาย Badge
// ให้ Invoice ลูกใน Drill-down เท่านั้น ไม่เกี่ยวกับ Filter/Tab ของหน้า)
const INVOICE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-blue-100 text-blue-700" },
  CANCELLED: { label: "ยกเลิกแล้ว", className: "bg-gray-100 text-gray-500" },
};
const TAB_ORDER = ["DRAFT", "CONFIRMED", "CANCELLED"];
const PAGE_SIZE = 25;

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type SearchParams = { status?: string; q?: string; dateFrom?: string; dateTo?: string; page?: string };

export default async function OrdersPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "order.create")) redirect("/");

  const dateFrom = searchParams.dateFrom || startOfMonth();
  const dateTo = searchParams.dateTo || endOfCurrentMonth();
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const baseWhere = {
    orderDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { reference: { contains: q, mode: "insensitive" as const } },
            { customer: { companyName: { contains: q, mode: "insensitive" as const } } },
            { customer: { code: { contains: q, mode: "insensitive" as const } } },
            // Doc-Center ข้อ 8 — ค้นหาด้วยเลขที่ Invoice ลูกต้องหา Parent Order เจอ
            // ไม่จำกัดสถานะ Invoice (ต้องหา Invoice ที่ยกเลิกแล้วเจอด้วย เพราะเป็น
            // Historical Document ที่ยังต้องตรวจสอบย้อนหลังได้)
            { invoices: { some: { invoiceNumber: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const [statusGroups, totalCount, orders] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: baseWhere, _count: true }),
    db.order.count({ where: baseWhere }),
    db.order.findMany({
      where: { ...baseWhere, ...(status ? { status: status as any } : {}) },
      include: {
        customer: true,
        branch: true,
        _count: { select: { items: true } },
        invoices: { orderBy: { createdAt: "asc" } },
      },
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
    ...TAB_ORDER.map((key) => ({ key, label: ORDER_STATUS_LABEL[key].label, count: counts[key] })),
  ];

  const currentCount = status ? counts[status] ?? 0 : totalCount;
  const totalPages = Math.max(1, Math.ceil(currentCount / PAGE_SIZE));
  const preserveParams = toQueryObject({ q: searchParams.q, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo, status: searchParams.status });
  const preserveParamsNoStatus = toQueryObject({ q: searchParams.q, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">เอกสาร / Document</h1>
        <a
          href="/orders/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          + สร้างออเดอร์ใหม่
        </a>
      </div>

      <form className="bg-white border rounded-lg p-4 grid grid-cols-4 gap-3 mb-4 items-end">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            ค้นหา (เลขที่ Order/Invoice/ชื่อลูกค้า/รหัสลูกค้า/อ้างอิง)
          </label>
          <input name="q" defaultValue={searchParams.q} placeholder="เช่น ORDER-202608, INV-A-202608 หรือ บริษัท..." className="w-full border rounded px-3 py-1.5 text-sm" />
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

      <StatusTabs tabs={tabs} activeKey={status ?? "all"} basePath="/orders" preserveParams={preserveParamsNoStatus} />

      {/* Desktop: หัวคอลัมน์คล้ายตาราง (ซ่อนบน Mobile เพราะเปลี่ยนเป็น Card/Stack แทน) */}
      <div className="hidden sm:grid grid-cols-[1fr_100px_1fr_90px_120px_90px_24px] gap-3 px-4 py-2 text-xs font-medium text-gray-500 border-b">
        <span>เลขที่ออเดอร์</span>
        <span>วันที่</span>
        <span>ลูกค้า</span>
        <span className="text-right">Invoice</span>
        <span className="text-right">ยอดรวม</span>
        <span>สถานะ</span>
        <span></span>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden divide-y">
        {orders.map((order) => {
          const activeInvoices = order.invoices.filter((inv) => inv.status !== "CANCELLED");
          const hasInvoices = order.invoices.length > 0;
          const total = order.status === "DRAFT" && !hasInvoices ? null : sumActiveInvoiceTotal(order.invoices);
          // Owner UAT Fix Batch 1 — ข้อ 8: Derived State จาก Invoice ลูกจริง (ไม่ใช่ Field
          // ใหม่/Label หลอก) — แสดงเสริมข้าง Order Status เดิม ไม่ได้แทนที่กัน
          const printState = deriveOrderPrintState(order.invoices);

          return (
            <details key={order.id} className="group">
              <summary className="cursor-pointer list-none hover:bg-gray-50">
                <div className="flex flex-col gap-1 px-4 py-3 sm:grid sm:grid-cols-[1fr_100px_1fr_90px_120px_90px_24px] sm:gap-3 sm:items-center">
                  <a
                    href={`/orders/${order.id}`}
                    className="font-mono text-blue-600 hover:underline text-sm"
                  >
                    {order.orderNumber}
                  </a>
                  <span className="text-xs text-gray-500 sm:text-sm sm:text-gray-900">
                    {order.orderDate.toLocaleDateString("th-TH")}
                  </span>
                  <span className="text-sm text-gray-700">{order.customer.companyName}</span>
                  <span className="text-xs text-gray-500 sm:text-sm sm:text-right">
                    {order.invoices.length} ใบ{activeInvoices.length !== order.invoices.length && ` (${activeInvoices.length} ใช้งานอยู่)`}
                  </span>
                  <span className="text-sm font-medium sm:text-right">{total === null ? "-" : `${money(total)} บาท`}</span>
                  <div className="flex items-center justify-between sm:justify-start">
                    <span className="flex items-center gap-1 flex-wrap">
                      <StatusBadge status={order.status} config={ORDER_STATUS_LABEL} />
                      {printState === "ALL_PRINTED" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                          พิมพ์แล้ว
                        </span>
                      )}
                      {printState === "PARTIALLY_PRINTED" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                          พิมพ์บางส่วน
                        </span>
                      )}
                    </span>
                    <span className="text-gray-400 transition-transform duration-150 group-open:rotate-90 sm:justify-self-end">
                      &rsaquo;
                    </span>
                  </div>
                </div>
              </summary>

              <div className="bg-gray-50 px-4 pb-3 pt-1 border-t">
                {order.invoices.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Order นี้ยังไม่มี Invoice (ยังไม่ Confirm)</p>
                ) : (
                  <div className="space-y-1.5 pt-2">
                    {order.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between bg-white border rounded px-3 py-2 text-sm"
                      >
                        <a href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
                          {inv.invoiceNumber}
                        </a>
                        <div className="flex items-center justify-between sm:justify-end sm:gap-4 text-xs sm:text-sm">
                          <span className="text-gray-500">{displayProductTypeCode(inv.productTypeCode)}</span>
                          <span className="text-gray-700">{money(inv.grandTotal)} บาท</span>
                          <StatusBadge status={inv.status} config={INVOICE_STATUS_LABEL} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          );
        })}
        {orders.length === 0 && <div className="px-4 py-8 text-center text-gray-400 text-sm">ไม่พบออเดอร์ที่ตรงกับเงื่อนไข</div>}
      </div>

      <Pagination page={page} totalPages={totalPages} totalCount={currentCount} basePath="/orders" preserveParams={preserveParams} />
    </div>
  );
}
