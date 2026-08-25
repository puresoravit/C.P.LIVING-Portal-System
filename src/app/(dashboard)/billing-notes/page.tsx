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

// Smoke Test R5 (2026-08-25) — CONFIRMED เดิมแปลว่า "ยืนยันแล้ว" (เขียว) ทำให้ Owner เข้าใจ
// ผิดว่าพิมพ์ไปแล้ว — เปลี่ยนเป็น "ยังไม่พิมพ์" (เหลือง) + เพิ่มสถานะ PRINTED (เขียว) แบบ
// เดียวกับ Invoice ทุกประการ
const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยังไม่พิมพ์", className: "bg-yellow-100 text-yellow-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};
// BillingNoteStatus enum ไม่มี DRAFT จริง — ไม่แสดง Tab "ร่าง"
const TAB_ORDER = ["CONFIRMED", "PRINTED", "CANCELLED"];
const PAGE_SIZE = 25;

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type SearchParams = { status?: string; q?: string; dateFrom?: string; dateTo?: string; page?: string };

export default async function BillingNotesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "billingNote.create")) redirect("/");

  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const baseWhere = {
    billingNoteDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
    ...(q
      ? {
          OR: [
            { billingNoteNumber: { contains: q, mode: "insensitive" as const } },
            { customerNameSnapshot: { contains: q, mode: "insensitive" as const } },
            { customer: { code: { contains: q, mode: "insensitive" as const } } },
            { invoices: { some: { invoiceNumber: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const [statusGroups, totalCount, notes] = await Promise.all([
    db.billingNote.groupBy({ by: ["status"], where: baseWhere, _count: true }),
    db.billingNote.count({ where: baseWhere }),
    db.billingNote.findMany({
      where: { ...baseWhere, ...(status ? { status: status as any } : {}) },
      include: { _count: { select: { invoices: true } } },
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
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">ใบวางบิล</h1>
        <a
          href="/billing-notes/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          + สร้างใบวางบิล
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">รวม Invoice หลายใบของลูกค้า 1 ราย ที่ยังไม่เคยถูกวางบิลมาก่อน</p>

      <form className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 items-end">
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ค้นหา (เลขที่/ชื่อลูกค้า/รหัสลูกค้า/เลขที่ Invoice ที่บรรจุอยู่)</label>
          <SearchInputWithClear
            defaultValue={searchParams.q}
            placeholder="เช่น BI-202608 หรือ บริษัท..."
            basePath="/billing-notes"
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
        <div className="col-span-1 sm:col-span-4">
          <button className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded px-4 py-2">ค้นหา</button>
        </div>
      </form>

      <StatusTabs tabs={tabs} activeKey={status ?? "all"} basePath="/billing-notes" preserveParams={preserveParamsNoStatus} />

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              {/* Smoke Test R6 (2026-08-25) — Owner: ติ๊กเลือกบางใบ/ทั้งหมดจากหน้านี้แล้วสั่ง
                  พิมพ์ต่อเนื่องทีละใบได้เลย (Print Queue กลไกเดียวกับ Multi-Invoice เดิม) —
                  ติ๊กได้เฉพาะใบที่ไม่ถูกยกเลิก */}
              <th className="px-3 py-2 w-8">
                <input type="checkbox" id="bnSelectAll" title="เลือกทั้งหมดในหน้านี้" />
              </th>
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">จำนวน Invoice</th>
              <th className="px-4 py-2 font-medium text-right">ยอดรวม</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2">
                  {n.status !== "CANCELLED" && (
                    <input type="checkbox" className="bn-print-checkbox" value={n.id} />
                  )}
                </td>
                <td className="px-4 py-2">
                  <a href={`/billing-notes/${n.id}`} className="font-mono text-blue-600 hover:underline">
                    {n.billingNoteNumber}
                  </a>
                </td>
                <td className="px-4 py-2">{n.billingNoteDate.toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2">{n.customerNameSnapshot}</td>
                <td className="px-4 py-2">{n._count.invoices} ใบ</td>
                <td className="px-4 py-2 text-right">{money(n.totalAmount)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={n.status} config={STATUS_LABEL} />
                </td>
              </tr>
            ))}
            {notes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบใบวางบิลที่ตรงกับเงื่อนไข
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="flex items-center gap-3 mt-3">
          <button
            id="bnPrintSelected"
            disabled
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2"
          >
            พิมพ์ใบวางบิลที่เลือก (<span id="bnPrintCount">0</span> ใบ)
          </button>
          <span className="text-xs text-gray-500">
            ติ๊กเลือกจากตารางด้านบน — ระบบจะเปิดหน้าพิมพ์เรียงต่อกันทีละใบ (ส่วนลดของแต่ละใบแสดงตามที่ตั้งไว้ตอนสร้าง)
          </span>
        </div>
      )}

      {notes.length > 0 && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                const boxes = Array.from(document.querySelectorAll('.bn-print-checkbox'));
                const selectAll = document.getElementById('bnSelectAll');
                const btn = document.getElementById('bnPrintSelected');
                const countEl = document.getElementById('bnPrintCount');
                function refresh() {
                  const picked = boxes.filter(b => b.checked);
                  countEl.textContent = String(picked.length);
                  btn.disabled = picked.length === 0;
                  if (selectAll) selectAll.checked = boxes.length > 0 && picked.length === boxes.length;
                }
                boxes.forEach(b => b.addEventListener('change', refresh));
                if (selectAll) selectAll.addEventListener('change', () => {
                  boxes.forEach(b => { b.checked = selectAll.checked; });
                  refresh();
                });
                btn.addEventListener('click', () => {
                  const ids = boxes.filter(b => b.checked).map(b => b.value);
                  if (ids.length === 0) return;
                  const back = location.pathname + location.search;
                  const params = new URLSearchParams();
                  params.set('back', back);
                  if (ids.length > 1) params.set('queue', ids.slice(1).join(','));
                  location.href = '/billing-notes/' + ids[0] + '/print?' + params.toString();
                });
                refresh();
              })();
            `,
          }}
        />
      )}

      <Pagination page={page} totalPages={totalPages} totalCount={currentCount} basePath="/billing-notes" preserveParams={preserveParams} />
    </div>
  );
}
