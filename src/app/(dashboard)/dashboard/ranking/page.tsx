import { getCustomerRanking, getProductRanking } from "@/lib/reports";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { startOfMonth, endOfCurrentMonth, safeDateParam } from "@/lib/date-utils";
import { toQueryObject } from "@/lib/search-params";
import { Pagination } from "@/components/pagination";
import { BackLink } from "@/components/back-link";
import { NavIcon } from "@/components/nav-icons";

// ==========================================================================
// Owner (2026-09-02) — Ranking เต็มของ "Top 10 ลูกค้า / Top 10 สินค้า" บน Dashboard:
// Dashboard ยังโชว์ 10 อันดับแรกเหมือนเดิมทุกอย่าง หน้านี้คือ "ดูต่ออันดับ 11, 12, 13 ..."
//
// Sales SOT/วิธีคำนวณ: ใช้ getCustomerRanking/getProductRanking ใน reports.ts ซึ่งเรียก
// getSalesByGroup(..., "customer") และ getTopProductModels ตัวเดียวกับ getDashboard เป๊ะ
// (ไม่มี Query/สูตรชุดใหม่) — ช่วงวันที่รับมาจาก Dashboard ผ่าน Query String ตัวเดียวกัน
// (dateFrom/dateTo + Default เดียวกัน) ตัวเลขจึงตรงกันเสมอ
// ==========================================================================

const PAGE_SIZE = 20;

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type SearchParams = { type?: string; dateFrom?: string; dateTo?: string; page?: string };

export default async function DashboardRankingPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  // Permission เดียวกับ Dashboard เป๊ะ (Billing Staff ไม่มีสิทธิ์ดูยอดขาย)
  if (!can((session?.user as any)?.role, "report.view")) redirect("/");

  const kind = searchParams.type === "product" ? "product" : "customer";
  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());
  const page = Math.max(1, Number(searchParams.page) || 1);
  const filters = { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) };

  // Query เฉพาะฝั่งที่กำลังดูจริง (ไม่ดึงอีกฝั่งมาให้เปลืองโดยเปล่าประโยชน์)
  const rows =
    kind === "customer"
      ? (await getCustomerRanking(filters)).map((g) => ({ key: g.key, label: g.label, metrics: g.metrics, href: null as string | null }))
      : (await getProductRanking(filters)).map((g) => ({
          key: g.key,
          label: g.label,
          metrics: g.metrics,
          // ลิงก์ Drill-down ตาม Size ใช้เส้นทางเดียวกับ Dashboard (standalone ไม่มีหน้า Drill-down)
          href:
            g.kind !== "standalone"
              ? `/products/model/${encodeURIComponent(g.key)}?dateFrom=${dateFrom}&dateTo=${dateTo}`
              : null,
        }));

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + PAGE_SIZE);

  // Owner (2026-09-04) — ยอดรวมท้ายตาราง แสดง "ทุกหน้า" (ไม่ต้องกดไปหน้าสุดท้ายเพื่อดูรวม)
  // + รวมเฉพาะหน้านี้เมื่อมีหลายหน้า — รวมทั้งหมดต้องเท่ากับการ์ด "จำนวนสินค้าที่ขาย"/
  // "ยอดสุทธิ (Net)" บน Dashboard เสมอ เพราะมาจากบรรทัด InvoiceItem ชุดเดียวกัน แค่จัดกลุ่ม
  // คนละแบบ (รายการยอด 0 ที่ถูกกรองออก มีจำนวน = 0 อยู่แล้วตามกฎ soldQuantity)
  const sumOf = (list: typeof rows) =>
    list.reduce((acc, r) => ({ quantity: acc.quantity + r.metrics.quantity, net: acc.net + r.metrics.net }), { quantity: 0, net: 0 });
  const grandTotal = sumOf(rows);
  const pageTotal = sumOf(pageRows);

  const dashboardHref = `/dashboard?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const title = kind === "customer" ? "อันดับลูกค้าตามยอดขาย" : "อันดับสินค้าตามยอดขาย";
  const otherHref = `/dashboard/ranking?type=${kind === "customer" ? "product" : "customer"}&dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const otherLabel = kind === "customer" ? "ดูอันดับสินค้า →" : "ดูอันดับลูกค้า →";

  return (
    <div className="max-w-4xl">
      <BackLink href={dashboardHref}>← กลับไป Dashboard</BackLink>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2 mb-1">
        <h1 className="flex items-center gap-1.5 text-lg font-semibold">
          <span
            className={`flex items-center justify-center w-6 h-6 rounded-md shrink-0 ${
              kind === "customer" ? "bg-sky-50 text-sky-600" : "bg-amber-50 text-amber-600"
            }`}
          >
            <NavIcon name={kind === "customer" ? "users" : "box"} className="w-3.5 h-3.5" />
          </span>
          {title}
        </h1>
        <a href={otherHref} className="text-sm text-blue-600 hover:underline">
          {otherLabel}
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        ช่วงวันที่ {toDisplayDate(dateFrom)} – {toDisplayDate(dateTo)} · เรียงยอดขายมากไปน้อย (แสดงเฉพาะที่มียอดขายจริง)
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-2 sm:px-4 py-2 font-medium w-10 sm:w-16">อันดับ</th>
                <th className="px-2 sm:px-4 py-2 font-medium">{kind === "customer" ? "ลูกค้า" : "สินค้า"}</th>
                <th className="px-2 sm:px-4 py-2 font-medium text-right w-14 sm:w-28 whitespace-nowrap">จำนวน</th>
                <th className="px-2 sm:px-4 py-2 font-medium text-right w-24 sm:w-36 whitespace-nowrap">ยอดขาย</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr key={row.key} className="border-t hover:bg-gray-50">
                  {/* อันดับต่อเนื่องจริงข้ามหน้า (หน้า 2 เริ่มที่ 21) */}
                  <td className="px-2 sm:px-4 py-2 text-gray-500">{offset + i + 1}</td>
                  <td className="px-2 sm:px-4 py-2">
                    {row.href ? (
                      <a href={row.href} className="text-blue-600 hover:underline">
                        {row.label}
                      </a>
                    ) : (
                      row.label
                    )}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-right text-gray-600">{row.metrics.quantity.toLocaleString("th-TH")}</td>
                  <td className="px-2 sm:px-4 py-2 text-right whitespace-nowrap">{money(row.metrics.net)}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    ยังไม่มียอดขายในช่วงวันที่นี้
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-gray-50">
                {totalPages > 1 && (
                  <tr className="border-t text-gray-600">
                    <td className="px-2 sm:px-4 py-2" colSpan={2}>
                      รวมหน้านี้ (อันดับ {offset + 1}–{offset + pageRows.length})
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-right">{pageTotal.quantity.toLocaleString("th-TH")}</td>
                    <td className="px-2 sm:px-4 py-2 text-right whitespace-nowrap">{money(pageTotal.net)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td className="px-2 sm:px-4 py-2" colSpan={2}>
                    รวมทั้งหมด ({totalCount.toLocaleString("th-TH")} รายการ{totalPages > 1 ? " · ทุกหน้า" : ""})
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-right">{grandTotal.quantity.toLocaleString("th-TH")}</td>
                  <td className="px-2 sm:px-4 py-2 text-right whitespace-nowrap">{money(grandTotal.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        basePath="/dashboard/ranking"
        preserveParams={toQueryObject({ type: kind, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo })}
      />
    </div>
  );
}
