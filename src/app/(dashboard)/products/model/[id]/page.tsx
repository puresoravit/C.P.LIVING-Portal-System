import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProductModelSizeBreakdown } from "@/lib/reports";
import { startOfMonth, endOfCurrentMonth } from "@/lib/date-utils";

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ข้อ 5 (Dashboard Requirement): Drill-down ของ Model หนึ่งตัว ต้องรักษา Date Range
// เดียวกับ Dashboard ที่กดเข้ามา (ผ่าน query string) ห้ามแสดง All-time โดยไม่ตั้งใจ —
// ถ้าไม่มี query string มาเลย (เข้าตรงๆ) ใช้ default เดียวกับ Dashboard เอง (เดือน
// ปัจจุบันเต็มเดือน) เพื่อไม่ให้ตกไปเป็น All-time โดยบังเอิญ
export default async function ProductModelDrillDownPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
  }
) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "report.view")) redirect("/");

  const model = await db.productModel.findUnique({ where: { id: params.id }, include: { productType: true } });
  if (!model) notFound();

  const dateFrom = searchParams.dateFrom || startOfMonth();
  const dateTo = searchParams.dateTo || endOfCurrentMonth();

  const { bySize, total } = await getProductModelSizeBreakdown(
    { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) },
    model.id
  );

  return (
    <div className="max-w-2xl">
      <a href="/" className="text-sm text-blue-600 hover:underline">
        ← กลับไปแดชบอร์ด
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">{model.name}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {model.productType.name} · ช่วงวันที่ {toDisplayDate(dateFrom)} – {toDisplayDate(dateTo)}
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">ขนาด</th>
              <th className="px-4 py-2 font-medium text-right">จำนวนที่ขาย</th>
              <th className="px-4 py-2 font-medium text-right">ยอดขาย (Net)</th>
            </tr>
          </thead>
          <tbody>
            {bySize.map((row) => (
              <tr key={row.size} className="border-t">
                <td className="px-4 py-2">{row.size}</td>
                <td className="px-4 py-2 text-right">{row.metrics.quantity.toLocaleString("th-TH")}</td>
                <td className="px-4 py-2 text-right">{money(row.metrics.net)}</td>
              </tr>
            ))}
            {bySize.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  ไม่มีข้อมูลการขายในช่วงวันที่นี้
                </td>
              </tr>
            )}
          </tbody>
          {bySize.length > 0 && (
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
