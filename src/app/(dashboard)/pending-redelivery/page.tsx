import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { StatusTabs } from "@/components/status-tabs";

// ==========================================================================
// Owner UAT (2026-08-29) — "หมวดค้างส่ง": รวมรายการ Invoice ที่พิมพ์แล้วแล้วถูกแก้ไขให้
// ยอดลดลง (เช่นลูกค้าตีกลับสินค้าบางส่วน) — Checklist ล้วนๆ ไม่แตะตัวเลขเอกสารใดๆ
// เข้าดูรายละเอียด (สินค้า/ขนาด/จำนวนที่ลดไป) ได้ที่หน้า [id] — ปิดรายการผ่านปุ่ม
// "ยืนยันว่าส่งของค้างไปแล้ว" ในหน้านั้น
// ==========================================================================

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type SearchParams = { status?: string };

export default async function PendingRedeliveryPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  // StatusTabs (Shared Component ของระบบ) กำหนดว่า key "all" = ไม่มี Param สถานะเลย
  // ใน URL เสมอ (Convention เดียวกับหน้ารายการเอกสารอื่นทุกหน้า) — Default ของหน้านี้จึง
  // เป็น "ทั้งหมด" ไม่ใช่ "ค้างอยู่" ให้ตรง Pattern เดิม (กรองดูเฉพาะค้างอยู่ผ่านการกดแท็บเอง)
  const status = searchParams.status === "open" ? "open" : searchParams.status === "resolved" ? "resolved" : "all";

  const [openCount, resolvedCount] = await Promise.all([
    db.invoicePendingRedelivery.count({ where: { resolvedAt: null } }),
    db.invoicePendingRedelivery.count({ where: { resolvedAt: { not: null } } }),
  ]);
  const tabs = [
    { key: "all", label: "ทั้งหมด", count: openCount + resolvedCount },
    { key: "open", label: "ค้างอยู่", count: openCount },
    { key: "resolved", label: "ปิดแล้ว", count: resolvedCount },
  ];

  const records = await db.invoicePendingRedelivery.findMany({
    where: status === "open" ? { resolvedAt: null } : status === "resolved" ? { resolvedAt: { not: null } } : {},
    include: { invoice: { select: { invoiceNumber: true, invoiceDate: true, customerNameSnapshot: true, parentOrderId: true, order: { select: { orderNumber: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">ค้างส่ง</h1>
      <p className="text-sm text-gray-500 mb-4">
        รายการ Invoice ที่พิมพ์แล้วถูกแก้ไขให้ยอดลดลง (เช่น สินค้าถูกตีกลับ) — ยังไม่ได้ส่งของค้างส่วนที่เหลือให้ลูกค้า
      </p>

      <StatusTabs tabs={tabs} activeKey={status} basePath="/pending-redelivery" preserveParams={{}} />

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">ลูกค้า</th>
                <th className="px-4 py-2 font-medium">วันที่ออกใบส่งของ</th>
                <th className="px-4 py-2 font-medium text-right">ยอดที่ลดลง</th>
                <th className="px-4 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <a href={`/pending-redelivery/${r.id}`} className="font-mono text-blue-600 hover:underline">
                      {r.invoice.invoiceNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2 font-mono text-gray-500">{r.invoice.order.orderNumber}</td>
                  <td className="px-4 py-2">{r.invoice.customerNameSnapshot}</td>
                  <td className="px-4 py-2">{r.invoice.invoiceDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2 text-right">{money(r.reducedAmount)}</td>
                  <td className="px-4 py-2">
                    {r.resolvedAt ? (
                      <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-gray-100 text-gray-500">
                        ปิดแล้ว
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-100 text-amber-700">
                        ค้างอยู่
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    ไม่มีรายการค้างส่ง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
