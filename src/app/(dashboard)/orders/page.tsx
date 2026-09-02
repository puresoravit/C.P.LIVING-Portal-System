import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { startOfMonth, endOfCurrentMonth, safeDateParam } from "@/lib/date-utils";
import { toQueryObject } from "@/lib/search-params";
import { buildStatusTabCounts } from "@/lib/status-tab-counts";
import { CancelButton } from "@/components/cancel-button";
import { ActionButton } from "@/components/action-button";
import { cancelOrder, deleteDraftOrder } from "./actions";
import { sumActiveInvoiceTotal, deriveOrderPrintState } from "@/lib/order-doc-center";
import { displayProductTypeCode } from "@/lib/order-preview";
import { StatusTabs } from "@/components/status-tabs";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { SearchInputWithClear } from "@/components/search-input-with-clear";

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
  const canCancel = can((session?.user as any)?.role, "order.cancel");

  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());
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

  // Owner UAT Round 2 — ข้อ 4: "พิมพ์แล้ว" ต้องเป็น Tab กรองได้จริงเหมือน Tab อื่น (ไม่ใช่
  // แค่ Badge ในแถว) — Order ไม่มี Column พิมพ์แล้วจริงในตัวเอง (ห้ามเดา OrderStatus.PRINTED
  // ใหม่) จึงต้องคำนวณจาก Invoice ลูก Active ทุกใบ = PRINTED เหมือน deriveOrderPrintState
  // เป๊ะ — Query เบาๆ แยกต่างหาก (id + invoice.status เท่านั้น) หา Order ที่เข้าเงื่อนไข
  // ก่อน แล้วใช้ id IN [...] กรอง/แบ่งหน้าที่ระดับ DB ตามปกติ (ไม่ใช่ Paginate เองใน JS)
  //
  // Owner UAT Fix Batch — ข้อ 5: เพิ่ม Tab "พิมพ์บางส่วน"/"ยังไม่พิมพ์" แยกจาก "พิมพ์แล้ว"
  // เดิม (Derived จาก Invoice ลูก Active เหมือนกันทุกประการ ไม่เพิ่ม OrderStatus Enum ใหม่)
  // — "ยังไม่พิมพ์" หมายถึง Order ที่ Confirmed แล้วและมี Invoice ลูก Active อยู่จริง แต่ยัง
  // ไม่มีใบไหน PRINTED เลยสักใบ (ต่างจาก deriveOrderPrintState ที่คืน null ทั้งกรณีนี้และ
  // กรณี "ไม่มี Invoice เลย" ปนกัน เพราะ Component นั้นออกแบบมาสำหรับ "ไม่ต้องโชว์ Badge
  // เสริม" ไม่ใช่สำหรับแยก Tab กรอง — จึงต้องแยก Logic ตรงนี้เอง ไม่แก้ Shared Function เดิม)
  const confirmedOrdersForPrintCheck = await db.order.findMany({
    where: { ...baseWhere, status: "CONFIRMED" },
    select: { id: true, invoices: { select: { status: true } } },
  });
  const allPrintedIds: string[] = [];
  const partiallyPrintedIds: string[] = [];
  const notPrintedIds: string[] = [];
  for (const o of confirmedOrdersForPrintCheck) {
    const printState = deriveOrderPrintState(o.invoices);
    if (printState === "ALL_PRINTED") allPrintedIds.push(o.id);
    else if (printState === "PARTIALLY_PRINTED") partiallyPrintedIds.push(o.id);
    else if (o.invoices.some((inv) => inv.status !== "CANCELLED")) notPrintedIds.push(o.id);
  }
  const printedCount = allPrintedIds.length;
  const partiallyPrintedCount = partiallyPrintedIds.length;
  const notPrintedCount = notPrintedIds.length;

  const PRINT_FILTER_IDS: Record<string, string[]> = {
    printed: allPrintedIds,
    partially_printed: partiallyPrintedIds,
    not_printed: notPrintedIds,
  };

  const [statusGroups, totalCount, orders] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: baseWhere, _count: true }),
    db.order.count({ where: baseWhere }),
    db.order.findMany({
      where:
        status && status in PRINT_FILTER_IDS
          ? { ...baseWhere, id: { in: PRINT_FILTER_IDS[status] } }
          : { ...baseWhere, ...(status ? { status: status as any } : {}) },
      include: {
        customer: true,
        branch: true,
        _count: { select: { items: true } },
        invoices: {
          orderBy: { createdAt: "asc" },
          include: { billingNote: { select: { id: true, billingNoteNumber: true } } },
        },
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
  // แทรก "พิมพ์แล้ว/พิมพ์บางส่วน/ยังไม่พิมพ์" หลัง "ยืนยันแล้ว" (CONFIRMED) — ตามลำดับ
  // Lifecycle จริงของเอกสาร (ร่าง → ยืนยันแล้ว → ยังไม่พิมพ์/พิมพ์บางส่วน/พิมพ์แล้ว → ยกเลิก)
  const tabs = [
    { key: "all", label: "ทั้งหมด", count: totalCount },
    { key: "DRAFT", label: ORDER_STATUS_LABEL.DRAFT.label, count: counts.DRAFT },
    { key: "CONFIRMED", label: ORDER_STATUS_LABEL.CONFIRMED.label, count: counts.CONFIRMED },
    { key: "not_printed", label: "ยังไม่พิมพ์", count: notPrintedCount },
    { key: "partially_printed", label: "พิมพ์บางส่วน", count: partiallyPrintedCount },
    { key: "printed", label: "พิมพ์แล้ว", count: printedCount },
    { key: "CANCELLED", label: ORDER_STATUS_LABEL.CANCELLED.label, count: counts.CANCELLED },
  ];

  const currentCount = status && status in PRINT_FILTER_IDS ? PRINT_FILTER_IDS[status].length : status ? counts[status] ?? 0 : totalCount;
  const totalPages = Math.max(1, Math.ceil(currentCount / PAGE_SIZE));
  const preserveParams = toQueryObject({ q: searchParams.q, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo, status: searchParams.status });
  const preserveParamsNoStatus = toQueryObject({ q: searchParams.q, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo });
  // Owner UAT Fix Batch 3 — ข้อ 5: ปุ่ม × ล้างเฉพาะ q — คง dateFrom/dateTo/status เดิมไว้
  const preserveParamsNoQ = toQueryObject({ dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo, status: searchParams.status });

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

      <form className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 items-end">
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            ค้นหา (เลขที่ Order/Invoice/ชื่อลูกค้า/รหัสลูกค้า/อ้างอิง)
          </label>
          <SearchInputWithClear
            defaultValue={searchParams.q}
            placeholder="เช่น ORDER-202608, INV-A-202608 หรือ บริษัท..."
            basePath="/orders"
            preserveParams={preserveParamsNoQ}
            formParams={status ? { status } : {}}
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
        <div className="col-span-1 sm:col-span-4">
          <button className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded px-4 py-2">ค้นหา</button>
        </div>
      </form>

      <StatusTabs tabs={tabs} activeKey={status ?? "all"} basePath="/orders" preserveParams={preserveParamsNoStatus} />

      {/* Desktop: หัวคอลัมน์คล้ายตาราง (ซ่อนบน Mobile เพราะเปลี่ยนเป็น Card/Stack แทน) */}
      <div className="hidden sm:grid grid-cols-[1fr_100px_1fr_90px_120px_90px_70px_24px] gap-3 px-4 py-2 text-xs font-medium text-gray-500 border-b">
        <span>เลขที่ออเดอร์</span>
        <span>วันที่</span>
        <span>ลูกค้า</span>
        <span className="text-right">Invoice</span>
        <span className="text-right">ยอดรวม</span>
        <span>สถานะ</span>
        <span></span>
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
                <div className="flex flex-col gap-1 px-4 py-3 sm:grid sm:grid-cols-[1fr_100px_1fr_90px_120px_90px_70px_24px] sm:gap-3 sm:items-center">
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
                    {/* Smoke Test R13 (2026-08-25) — Owner: ยกเลิก Order ได้จากหน้ารายการนี้เลย
                        (Cascade ยกเลิก Invoice ลูกอัตโนมัติ — Dashboard/ใบวางบิลตัดยอด/รายการ
                        ให้เองเพราะกรองเฉพาะ PRINTED) — Guard ใบวางบิล/ใบกำกับที่เกาะอยู่แจ้ง
                        ผ่าน Toast จาก Action */}
                    {/* Owner UAT (2026-09-02) — จุดที่หลุดจากรอบแรก: หน้า List นี้มีปุ่มยกเลิก
                        ของตัวเอง (Owner กดจากตรงนี้แล้วได้ CANCELLED แทนการลบร่าง) — DRAFT
                        ต้องเป็น "ลบร่าง" (ลบจริง) เหมือนหน้า Detail ทุกประการ */}
                    {canCancel && order.status === "DRAFT" ? (
                      <ActionButton
                        action={deleteDraftOrder.bind(null, order.id)}
                        confirmMessage={`ลบร่าง ${order.orderNumber} ถาวรหรือไม่? เอกสารยังไม่เคยยืนยัน — ลบแล้วจะไม่แสดงในระบบอีก`}
                        label="ลบร่าง"
                        pendingLabel="กำลังลบ..."
                        successMessage="ลบร่างสำเร็จ"
                        className="text-xs text-gray-500 hover:text-red-600 border rounded px-2 py-1 whitespace-nowrap"
                      />
                    ) : canCancel && order.status !== "CANCELLED" ? (
                      <CancelButton
                        action={cancelOrder.bind(null, order.id)}
                        confirmMessage={`ยืนยันยกเลิก ${order.orderNumber}? Invoice ในออเดอร์นี้จะถูกยกเลิกทั้งหมด และยอดขายที่นับไว้จะถูกหักออกจาก Dashboard`}
                        label="ยกเลิก"
                        successMessage="ยกเลิกออเดอร์และ Invoice ที่เกี่ยวข้องแล้ว"
                        className="text-xs text-gray-500 hover:text-red-600 border rounded px-2 py-1 whitespace-nowrap"
                      />
                    ) : (
                      <span></span>
                    )}
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
                          {/* Owner UAT Fix Batch — ข้อ 5: โชว์ printedAt ให้ตรวจสอบได้ว่า
                              ใบไหน "พิมพ์แล้ว" จริงๆ เมื่อไหร่ ไม่ใช่แค่ Badge Status เฉยๆ */}
                          <span className="text-gray-400 whitespace-nowrap">
                            {inv.printedAt ? `พิมพ์เมื่อ ${inv.printedAt.toLocaleDateString("th-TH")}` : "ยังไม่พิมพ์"}
                          </span>
                          {/* Billing Status Visibility — แกนแยกจาก Document Status เดิม
                              เฉพาะ Invoice ที่ PRINTED เท่านั้นที่มีความหมาย */}
                          {inv.status === "PRINTED" &&
                            (inv.billingNote ? (
                              <a
                                href={`/billing-notes/${inv.billingNote.id}`}
                                className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 whitespace-nowrap"
                              >
                                วางบิลแล้ว: {inv.billingNote.billingNoteNumber}
                              </a>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                                ยังไม่วางบิล
                              </span>
                            ))}
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
