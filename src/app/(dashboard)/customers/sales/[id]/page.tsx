import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCustomerSalesBreakdown } from "@/lib/reports";
import { displayProductTypeCode } from "@/lib/order-preview";
import { startOfMonth, endOfCurrentMonth, safeDateParam } from "@/lib/date-utils";
import { deriveOrderPrintState } from "@/lib/order-doc-center";
import { StatusBadge } from "@/components/status-badge";
import { BackLink } from "@/components/back-link";

const ORDER_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};
const INVOICE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-blue-100 text-blue-700" },
  CANCELLED: { label: "ยกเลิกแล้ว", className: "bg-gray-100 text-gray-500" },
};

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}


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

  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());

  // Owner (2026-09-03) — ยิงครั้งเดียวคุมทั้งตารางกลุ่มส่วนลด (แตกรายการสินค้า) และ Trace
  // ต่อ Order — ยอดทุกมุมมองมาจากแถวชุดเดียวกัน จึงตรงกันทุกคอลัมน์โดยโครงสร้าง
  // (แก้ปัญหาเดิมที่ตารางกับ Trace ใช้ฐานคนละตัวจนยอดไม่ตรงกัน)
  const { groups, total, byOrder } = await getCustomerSalesBreakdown({
    dateFrom: new Date(dateFrom),
    dateTo: new Date(dateTo),
    customerId: customer.id,
  });

  const orderIds = [...byOrder.keys()];

  const traceOrders = orderIds.length
    ? await db.order.findMany({
        where: { id: { in: orderIds } },
        include: { invoices: { orderBy: { createdAt: "asc" } } },
      })
    : [];
  // เรียงตามยอดที่นับใน Dashboard มาก→น้อย ให้ตรงกับสิ่งที่ Owner สนใจ Trace ก่อน (ยอดใหญ่
  // สุดต้องเจอเร็วที่สุด)
  traceOrders.sort((a, b) => (byOrder.get(b.id)?.net ?? 0) - (byOrder.get(a.id)?.net ?? 0));

  return (
    <div className="max-w-2xl">
      <BackLink href="/dashboard">← กลับไปแดชบอร์ด</BackLink>
      <h1 className="text-lg font-semibold mt-2 mb-1">{customer.companyName}</h1>
      <p className="text-sm text-gray-500 mb-4">
        แยกตามกลุ่มส่วนลด · ช่วงวันที่ {toDisplayDate(dateFrom)} – {toDisplayDate(dateTo)}
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        {/* Owner (2026-09-03) — Mobile-first: 360px ต้องอ่านง่ายไม่ต้องเลื่อนซ้ายขวา —
            จอเล็กโชว์ 2 คอลัมน์ตัวเลข (จำนวน + Net) ส่วน "ก่อนส่วนลด/ส่วนลดกลุ่ม" ย้ายไป
            เป็นบรรทัดย่อยใต้ชื่อ (sm:hidden) แล้วค่อยกางเป็นคอลัมน์เต็มบนจอ ≥640px */}
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-3 sm:px-4 py-2 font-medium">กลุ่มส่วนลด / รายการ</th>
              <th className="px-2 sm:px-4 py-2 font-medium text-right whitespace-nowrap">จำนวนขาย</th>
              <th className="hidden sm:table-cell px-4 py-2 font-medium text-right whitespace-nowrap">ยอดก่อนส่วนลด</th>
              <th className="hidden sm:table-cell px-4 py-2 font-medium text-right whitespace-nowrap">ส่วนลดกลุ่ม</th>
              <th className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">ยอดขาย (Net)</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.typeCode} className="border-t">
              {/* หัวกลุ่มส่วนลด */}
              <tr className="bg-gray-50/60">
                <td className="px-3 sm:px-4 pt-2 pb-1 font-medium" colSpan={5}>
                  {g.typeLabel}
                </td>
              </tr>
              {/* รายการสินค้าในกลุ่ม (ระดับรุ่น — ของแถมยอด 0 ไม่แสดง) */}
              {g.products.map((prod) => (
                <tr key={prod.key} className="align-top">
                  <td className="px-3 sm:px-4 py-1.5 pl-6 sm:pl-8">
                    <span className="text-gray-400 mr-1">•</span>
                    {prod.kind !== "standalone" ? (
                      <a
                        href={`/products/model/${encodeURIComponent(prod.key)}?dateFrom=${dateFrom}&dateTo=${dateTo}`}
                        className="text-blue-600 hover:underline"
                      >
                        {prod.label}
                      </a>
                    ) : (
                      prod.label
                    )}
                    {/* จอเล็ก: ยอดก่อนส่วนลด/ส่วนลด มาอยู่บรรทัดย่อยแทนคอลัมน์ */}
                    <div className="sm:hidden text-xs text-gray-500 mt-0.5">
                      ก่อนส่วนลด {money(prod.metrics.gross)} · ส่วนลด {money(prod.metrics.discount)}
                    </div>
                  </td>
                  <td className="px-2 sm:px-4 py-1.5 text-right">{prod.metrics.quantity.toLocaleString("th-TH")}</td>
                  <td className="hidden sm:table-cell px-4 py-1.5 text-right text-gray-600">{money(prod.metrics.gross)}</td>
                  <td className="hidden sm:table-cell px-4 py-1.5 text-right text-gray-600">{money(prod.metrics.discount)}</td>
                  <td className="px-3 sm:px-4 py-1.5 text-right">{money(prod.metrics.net)}</td>
                </tr>
              ))}
              {/* รวมต่อกลุ่ม = ผลบวกของรายการด้านบนเป๊ะ */}
              <tr className="border-t font-medium">
                <td className="px-3 sm:px-4 py-1.5 pl-6 sm:pl-8">
                  รวม {g.typeLabel}
                  <div className="sm:hidden text-xs font-normal text-gray-500 mt-0.5">
                    ก่อนส่วนลด {money(g.metrics.gross)} · ส่วนลด {money(g.metrics.discount)}
                  </div>
                </td>
                <td className="px-2 sm:px-4 py-1.5 text-right">{g.metrics.quantity.toLocaleString("th-TH")}</td>
                <td className="hidden sm:table-cell px-4 py-1.5 text-right">{money(g.metrics.gross)}</td>
                <td className="hidden sm:table-cell px-4 py-1.5 text-right">{money(g.metrics.discount)}</td>
                <td className="px-3 sm:px-4 py-1.5 text-right">{money(g.metrics.net)}</td>
              </tr>
            </tbody>
          ))}
          {groups.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  ไม่มีข้อมูลการขายในช่วงวันที่นี้
                </td>
              </tr>
            </tbody>
          )}
          {groups.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-semibold bg-gray-50">
                <td className="px-3 sm:px-4 py-2">
                  รวมทั้งหมด
                  <div className="sm:hidden text-xs font-normal text-gray-500 mt-0.5">
                    ก่อนส่วนลด {money(total.gross)} · ส่วนลด {money(total.discount)}
                  </div>
                </td>
                <td className="px-2 sm:px-4 py-2 text-right">{total.quantity.toLocaleString("th-TH")}</td>
                <td className="hidden sm:table-cell px-4 py-2 text-right">{money(total.gross)}</td>
                <td className="hidden sm:table-cell px-4 py-2 text-right">{money(total.discount)}</td>
                <td className="px-3 sm:px-4 py-2 text-right">{money(total.net)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>

      {/* Owner UAT Fix Batch — ข้อ 4: Trace ยอดกลับไปถึง ORDER/INV ต้นทาง — Hierarchy
          Customer (หน้านี้อยู่แล้ว) → ORDER → Child INV — ยอด "ที่ถูกนับใน Dashboard" ต่อ
          Order มาจาก Query เดียวกับ Sales SOT เป๊ะ (ดู byOrder จาก getCustomerSalesBreakdown) รวมกันได้เท่ากับ
          total.net พอดี (Invariant เดียวกับตาราง กลุ่มส่วนลด ด้านบน — Partition เดียวกัน
          คนละมุมมอง Group) — Derived Status ใช้ deriveOrderPrintState เดิมจาก Document
          Center ทุกประการ ไม่มี Logic ใหม่ */}
      <h2 className="font-medium text-sm mt-6 mb-2">Trace ยอดขาย: Order → Invoice ต้นทาง</h2>
      <p className="text-xs text-gray-500 mb-2">
        เฉพาะ Order ที่มี Invoice ผ่าน Sales SOT (สถานะพิมพ์แล้ว) ในช่วงวันที่นี้ — ยอดต่อ Order ใช้ฐานเดียวกับตารางด้านบนเป๊ะ (ก่อนส่วนลด → Net หลังหักส่วนลดกลุ่ม)
        ส่วน Derived Status สะท้อนสถานะ Invoice ลูกทั้งหมดของ Order ณ ปัจจุบัน (อาจมีใบอื่นที่ยังไม่พิมพ์/อยู่นอกช่วงวันที่นี้ปะปนอยู่)
      </p>

      <div className="bg-white border rounded-lg overflow-hidden divide-y mb-2">
        {traceOrders.map((order) => {
          const printState = deriveOrderPrintState(order.invoices);
          const om = byOrder.get(order.id);
          return (
            <details key={order.id} className="group">
              <summary className="cursor-pointer list-none hover:bg-gray-50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 px-4 py-3">
                  <div>
                    <a href={`/orders/${order.id}`} className="font-mono text-blue-600 hover:underline text-sm">
                      {order.orderNumber}
                    </a>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {order.orderDate.toLocaleDateString("th-TH")} · {order.invoices.length} Invoice ลูก
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end">
                    {/* Owner (2026-09-03) — โชว์ 2 ยอดเหมือนตารางด้านบน ฐานเดียวกันเป๊ะ:
                        ก่อนส่วนลด → Net (จอเล็กซ้อน 2 บรรทัด กันล้นขอบ) */}
                    <span className="text-left sm:text-right leading-tight mr-auto sm:mr-0">
                      <span className="block text-xs text-gray-500">ก่อนส่วนลด {money(om?.gross ?? 0)}</span>
                      <span className="block text-sm font-medium">Net {money(om?.net ?? 0)}</span>
                    </span>
                    <StatusBadge status={order.status} config={ORDER_STATUS_LABEL} />
                    {printState === "ALL_PRINTED" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">พิมพ์แล้ว</span>
                    )}
                    {printState === "PARTIALLY_PRINTED" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">พิมพ์บางส่วน</span>
                    )}
                    <span className="text-gray-400 transition-transform duration-150 group-open:rotate-90">&rsaquo;</span>
                  </div>
                </div>
              </summary>
              <div className="bg-gray-50 px-4 pb-3 pt-1 border-t">
                <div className="space-y-1.5 pt-2">
                  {order.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between bg-white border rounded px-3 py-2 text-sm">
                      <a href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
                        {inv.invoiceNumber}
                      </a>
                      <div className="flex items-center gap-4 text-xs sm:text-sm">
                        <span className="text-gray-500">{displayProductTypeCode(inv.productTypeCode)}</span>
                        <span className="text-gray-700">{money(Number(inv.grandTotal))} บาท</span>
                        <StatusBadge status={inv.status} config={INVOICE_STATUS_LABEL} />
                        <span className="text-gray-400 text-xs whitespace-nowrap">
                          {inv.printedAt ? `พิมพ์เมื่อ ${inv.printedAt.toLocaleDateString("th-TH")}` : "ยังไม่พิมพ์"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
        {traceOrders.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">ไม่มี Order ที่เข้า Sales SOT ในช่วงวันที่นี้</div>
        )}
      </div>
      {traceOrders.length > 0 && (
        <p className="text-xs text-gray-500">
          รวม ก่อนส่วนลด {money([...byOrder.values()].reduce((sum, m) => sum + m.gross, 0))} · Net {money([...byOrder.values()].reduce((sum, m) => sum + m.net, 0))} — เท่ากับยอด &quot;รวมทั้งหมด&quot; ในตารางด้านบนทั้งสองค่า (Partition เดียวกัน)
        </p>
      )}
    </div>
  );
}
