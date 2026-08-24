import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProductModelSizeBreakdown } from "@/lib/reports";
import { startOfMonth, endOfCurrentMonth, safeDateParam } from "@/lib/date-utils";

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

  // Owner UAT — ข้อ 1: params.id เป็น "model:{id}" (ProductModel จริง) หรือ "family:{id}"
  // (Product ที่เป็น Size Family Anchor ของตัวเอง — ไม่ต้องพึ่ง ProductModel อีกต่อไป) —
  // Key มี Prefix มาจาก getTopProductModels เสมอ (resolveProductFamily เดียวกัน) กันไม่ให้
  // 2 ฝั่งตีความ id เพี้ยนกัน — รองรับ Legacy Link แบบไม่มี Prefix (คือ modelId ตรงๆ) ไว้
  // ด้วย เผื่อมี Bookmark/Link เก่าจากก่อนเปลี่ยน Key Scheme
  //
  // Owner UAT Fix — params ของ Dynamic Route มาแบบ Percent-encoded (":" → "%3A") ต้อง
  // decodeURIComponent ก่อนแยก Prefix เสมอ — เดิมไม่ Decode ทำให้หา ":" ไม่เจอ แล้วเอา
  // "model%3A..." ทั้งก้อนไปหาเป็น modelId → notFound() (Owner เจอ 404 ตอนกดจาก Top10) —
  // Legacy Link (modelId เปล่าๆ เป็น cuid ไม่มีอักขระพิเศษ) Decode แล้วได้ค่าเดิมเป๊ะ
  // ไม่กระทบ
  const decodedId = decodeURIComponent(params.id);
  const separatorIdx = decodedId.indexOf(":");
  const kind = separatorIdx === -1 ? "model" : (decodedId.slice(0, separatorIdx) as "model" | "family");
  const rawId = separatorIdx === -1 ? decodedId : decodedId.slice(separatorIdx + 1);

  const entity =
    kind === "family"
      ? await db.product.findUnique({ where: { id: rawId }, include: { productType: true } })
      : await db.productModel.findUnique({ where: { id: rawId }, include: { productType: true } });
  if (!entity) notFound();

  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());

  const { bySize, total } = await getProductModelSizeBreakdown(
    { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) },
    `${kind}:${rawId}`
  );

  return (
    <div className="max-w-2xl">
      <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
        ← กลับไปแดชบอร์ด
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">{entity.name}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {entity.productType?.name ?? "ไม่ระบุกลุ่มส่วนลด"} · ช่วงวันที่ {toDisplayDate(dateFrom)} – {toDisplayDate(dateTo)}
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
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
    </div>
  );
}
