import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSalesByGroup } from "@/lib/reports";
import { UNSPECIFIED_TYPE_CODE } from "@/lib/order-preview";
import { startOfMonth, endOfCurrentMonth } from "@/lib/date-utils";

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// R6 Phase D — ข้อ H: Customer → กลุ่มส่วนลด Drill-down จากการ์ดลูกค้าบน Dashboard —
// Reuse getSalesByGroup(..., "productType") เดิมเป๊ะ (กรอง customerId เพิ่ม) ไม่มี Query
// ใหม่ ใช้ Sales SOT เดียวกับ Dashboard ทุกจุด (PRINTED เท่านั้น) — ผลรวมแต่ละกลุ่มบวก
// กันได้เท่ากับยอดรวมลูกค้าบน Dashboard เสมอเพราะมาจาก Query เดียวกันตรงๆ ไม่ได้คำนวณซ้ำ
// GEN (ไม่มีกลุ่มส่วนลด) แสดงเป็น "สินค้าทั่วไป" เฉพาะหน้านี้ตามคำที่ Owner ระบุ — ไม่แตะ
// UNSPECIFIED_TYPE_LABEL ที่ใช้ที่อื่น (Invoice List/Order Preview ฯลฯ) เพื่อไม่เปลี่ยน
// คำศัพท์จุดอื่นที่ไม่ได้ขอ
const GENERAL_PRODUCT_LABEL = "สินค้าทั่วไป";

export default async function CustomerSalesDrillDownPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
  }
) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "report.view")) redirect("/");

  const customer = await db.customer.findUnique({ where: { id: params.id } });
  if (!customer) notFound();

  const dateFrom = searchParams.dateFrom || startOfMonth();
  const dateTo = searchParams.dateTo || endOfCurrentMonth();

  const groups = await getSalesByGroup(
    { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo), customerId: customer.id },
    "productType"
  );
  const total = groups.reduce(
    (sum, g) => ({
      quantity: sum.quantity + g.metrics.quantity,
      net: sum.net + g.metrics.net,
    }),
    { quantity: 0, net: 0 }
  );

  return (
    <div className="max-w-2xl">
      <a href="/" className="text-sm text-blue-600 hover:underline">
        ← กลับไปแดชบอร์ด
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">{customer.companyName}</h1>
      <p className="text-sm text-gray-500 mb-4">
        แยกตามกลุ่มส่วนลด · ช่วงวันที่ {toDisplayDate(dateFrom)} – {toDisplayDate(dateTo)}
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
              <th className="px-4 py-2 font-medium text-right">จำนวนที่ขาย</th>
              <th className="px-4 py-2 font-medium text-right">ยอดขาย (Net)</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-t">
                <td className="px-4 py-2">{g.key === UNSPECIFIED_TYPE_CODE ? GENERAL_PRODUCT_LABEL : g.label}</td>
                <td className="px-4 py-2 text-right">{g.metrics.quantity.toLocaleString("th-TH")}</td>
                <td className="px-4 py-2 text-right">{money(g.metrics.net)}</td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  ไม่มีข้อมูลการขายในช่วงวันที่นี้
                </td>
              </tr>
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="border-t font-medium bg-gray-50">
                <td className="px-4 py-2">รวม</td>
                <td className="px-4 py-2 text-right">{total.quantity.toLocaleString("th-TH")}</td>
                <td className="px-4 py-2 text-right">{money(total.net)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
