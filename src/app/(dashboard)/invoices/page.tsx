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

// Billing Status Visibility — ข้อกำหนดใหม่: "สถานะการวางบิล" เป็นแกนแยกจาก Document
// Status (PRINTED) เดิมโดยเด็ดขาด ห้ามปนกัน — PRINTED ยังหมายถึง Checkpoint พิมพ์ 9×11
// ตาม Rule เดิมทุกประการ (ไม่แตะ Sales SOT/markInvoicePrinted เลย) — "วางบิลแล้ว/ยังไม่
// วางบิล" มาจาก Relation Invoice.billingNoteId ที่มีอยู่แล้ว (Reuse ตรงๆ ไม่เพิ่ม Schema)
// — สองแกนนี้เป็นอิสระต่อกัน: DRAFT/CONFIRMED/CANCELLED ไม่มีทางมี billingNoteId อยู่แล้ว
// (Business Rule เดิม — จะวางบิลได้ต้อง PRINTED ก่อนเท่านั้น ดู billing-notes/new/page.tsx)
// จึง Derived Tab สองอันนี้มีความหมายเฉพาะเจาะจงกับ Invoice ที่ PRINTED เท่านั้น
const BILLING_STATUS_LABEL: Record<"billed" | "unbilled", { label: string; className: string }> = {
  unbilled: { label: "ยังไม่วางบิล", className: "bg-amber-100 text-amber-700" },
  billed: { label: "วางบิลแล้ว", className: "bg-purple-100 text-purple-700" },
};

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type SearchParams = { status?: string; q?: string; dateFrom?: string; dateTo?: string; page?: string };

export default async function InvoicesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const baseWhere = {
    invoiceDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" as const } },
            // Owner Approve (2026-09-02) — Physical Sheet: ค้นด้วยเลขแผ่นแล้วเจอใบหลักด้วย
            // (ทุกเลขแผ่นต้อง Search/Open ได้จริงตาม Requirement)
            { sheets: { some: { sheetNumber: { contains: q, mode: "insensitive" as const } } } },
            { customerNameSnapshot: { contains: q, mode: "insensitive" as const } },
            { customer: { code: { contains: q, mode: "insensitive" as const } } },
            { order: { orderNumber: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  // Billing Status — Where เสริมสำหรับ 2 Tab ใหม่ (คำนวณแยกเพราะไม่ใช่ Prisma groupBy
  // ปกติ ต้องรวม status:"PRINTED" + billingNoteId เข้าด้วยกันเสมอ)
  const BILLING_STATUS_WHERE: Record<string, { status: "PRINTED"; billingNoteId: any }> = {
    printed_unbilled: { status: "PRINTED", billingNoteId: null },
    printed_billed: { status: "PRINTED", billingNoteId: { not: null } },
  };

  const [statusGroups, totalCount, printedUnbilledCount, printedBilledCount, invoices] = await Promise.all([
    db.invoice.groupBy({ by: ["status"], where: baseWhere, _count: true }),
    db.invoice.count({ where: baseWhere }),
    db.invoice.count({ where: { ...baseWhere, ...BILLING_STATUS_WHERE.printed_unbilled } }),
    db.invoice.count({ where: { ...baseWhere, ...BILLING_STATUS_WHERE.printed_billed } }),
    db.invoice.findMany({
      where:
        status && status in BILLING_STATUS_WHERE
          ? { ...baseWhere, ...BILLING_STATUS_WHERE[status] }
          : { ...baseWhere, ...(status ? { status: status as any } : {}) },
      include: {
        billingNote: { select: { id: true, billingNoteNumber: true } },
        // Owner Approve (2026-09-02) — Physical Sheet: โชว์เลขแผ่น + สถานะพิมพ์บางแผ่น
        sheets: {
          where: { voidedAt: null, numberReleased: false },
          orderBy: { sheetNo: "asc" },
          select: { id: true, sheetNumber: true, printedAt: true },
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
  // แทรก "ยังไม่วางบิล/วางบิลแล้ว" หลัง "พิมพ์แล้ว" — เป็น Refinement ของ Tab พิมพ์แล้ว
  // เดิม (ซึ่งยังอยู่ นับ PRINTED ทั้งหมดไม่แยกว่าวางบิลหรือยัง เหมือนเดิมทุกประการ)
  const tabs = [
    { key: "all", label: "ทั้งหมด", count: totalCount },
    { key: "DRAFT", label: STATUS_LABEL.DRAFT.label, count: counts.DRAFT },
    { key: "CONFIRMED", label: STATUS_LABEL.CONFIRMED.label, count: counts.CONFIRMED },
    { key: "PRINTED", label: STATUS_LABEL.PRINTED.label, count: counts.PRINTED },
    { key: "printed_unbilled", label: "ยังไม่วางบิล", count: printedUnbilledCount },
    { key: "printed_billed", label: "วางบิลแล้ว", count: printedBilledCount },
    { key: "CANCELLED", label: STATUS_LABEL.CANCELLED.label, count: counts.CANCELLED },
  ];

  const currentCount =
    status && status in BILLING_STATUS_WHERE
      ? status === "printed_unbilled"
        ? printedUnbilledCount
        : printedBilledCount
      : status
        ? counts[status] ?? 0
        : totalCount;
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

      <form className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 items-end">
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ค้นหา (เลขที่/ชื่อลูกค้า/รหัสลูกค้า/เลขที่ Order)</label>
          <SearchInputWithClear
            defaultValue={searchParams.q}
            placeholder="เช่น INV-A-202608 หรือ บริษัท..."
            basePath="/invoices"
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

      <StatusTabs tabs={tabs} activeKey={status ?? "all"} basePath="/invoices" preserveParams={preserveParamsNoStatus} />

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
              <th className="px-4 py-2 font-medium text-right">ยอดสุทธิ</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2 font-medium">สถานะวางบิล</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <a href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
                    {inv.invoiceNumber}
                  </a>
                  {/* Owner Approve (2026-09-02) — Physical Sheet: ใบหลายแผ่นโชว์ช่วงเลขแผ่น
                      ให้เห็นตรงนี้เลยว่า Refer เลขไหนได้บ้าง */}
                  {inv.sheets.length > 1 && (
                    <div className="text-xs text-gray-500 font-mono">
                      {inv.sheets.length} แผ่น: {inv.sheets[0].sheetNumber} – {inv.sheets[inv.sheets.length - 1].sheetNumber}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2">{inv.customerNameSnapshot}</td>
                <td className="px-4 py-2">{displayProductTypeCode(inv.productTypeCode)}</td>
                <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={inv.status} config={STATUS_LABEL} />
                  {/* PARTIAL — พิมพ์แล้วบางแผ่น (ใบหลักยัง CONFIRMED จนกว่าจะครบทุกแผ่น) */}
                  {inv.status === "CONFIRMED" &&
                    inv.sheets.length > 0 &&
                    inv.sheets.some((s) => s.printedAt != null) && (
                      <div className="text-xs text-amber-600 whitespace-nowrap">
                        พิมพ์แล้ว {inv.sheets.filter((s) => s.printedAt != null).length}/{inv.sheets.length} แผ่น
                      </div>
                    )}
                </td>
                {/* Billing Status Visibility — แกนแยกจาก Document Status ข้างบน แสดงเฉพาะ
                    Invoice ที่ PRINTED เท่านั้น (แกนนี้ไม่มีความหมายกับสถานะอื่น) — ถ้าวาง
                    บิลแล้ว กดไปดู/ตรวจสอบใบวางบิลที่ผูกอยู่ได้ตรงๆ ผ่าน Relation เดิม */}
                <td className="px-4 py-2">
                  {inv.status !== "PRINTED" ? (
                    <span className="text-gray-300">-</span>
                  ) : inv.billingNote ? (
                    <a
                      href={`/billing-notes/${inv.billingNote.id}`}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 whitespace-nowrap"
                    >
                      {BILLING_STATUS_LABEL.billed.label}: {inv.billingNote.billingNoteNumber}
                    </a>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${BILLING_STATUS_LABEL.unbilled.className}`}>
                      {BILLING_STATUS_LABEL.unbilled.label}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบ Invoice ที่ตรงกับเงื่อนไข
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} totalCount={currentCount} basePath="/invoices" preserveParams={preserveParams} />
    </div>
  );
}
