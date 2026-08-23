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
// RepairReturnStatus enum ไม่มี DRAFT จริง — ไม่แสดง Tab "ร่าง"
const TAB_ORDER = ["CONFIRMED", "CANCELLED"];
const PAGE_SIZE = 25;

type SearchParams = { status?: string; q?: string; dateFrom?: string; dateTo?: string; page?: string };

export default async function RepairNotesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "repairNote.create")) redirect("/");

  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const baseWhere = {
    noteDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
    ...(q
      ? {
          OR: [
            { noteNumber: { contains: q, mode: "insensitive" as const } },
            { reference: { contains: q, mode: "insensitive" as const } },
            { customerNameSnapshot: { contains: q, mode: "insensitive" as const } },
            { customer: { code: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [statusGroups, totalCount, notes] = await Promise.all([
    db.repairReturnNote.groupBy({ by: ["status"], where: baseWhere, _count: true }),
    db.repairReturnNote.count({ where: baseWhere }),
    db.repairReturnNote.findMany({
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
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">ใบส่งคืนสินค้าฝากซ่อม</h1>
        <a
          href="/repair-notes/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          + สร้างใหม่
        </a>
      </div>

      <form className="bg-white border rounded-lg p-4 grid grid-cols-4 gap-3 mb-4 items-end">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ค้นหา (เลขที่/ชื่อลูกค้า/รหัสลูกค้า/อ้างอิง)</label>
          <SearchInputWithClear
            defaultValue={searchParams.q}
            placeholder="เช่น DEP-202608 หรือ บริษัท..."
            basePath="/repair-notes"
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

      <StatusTabs tabs={tabs} activeKey={status ?? "all"} basePath="/repair-notes" preserveParams={preserveParamsNoStatus} />

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">อ้างอิง</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <a href={`/repair-notes/${n.id}`} className="font-mono text-blue-600 hover:underline">
                    {n.noteNumber}
                  </a>
                </td>
                <td className="px-4 py-2">{n.noteDate.toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2">{n.customerNameSnapshot}</td>
                <td className="px-4 py-2 text-gray-500">{n.reference ?? "-"}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={n.status} config={STATUS_LABEL} />
                </td>
              </tr>
            ))}
            {notes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบเอกสารที่ตรงกับเงื่อนไข
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} totalCount={currentCount} basePath="/repair-notes" preserveParams={preserveParams} />
    </div>
  );
}
