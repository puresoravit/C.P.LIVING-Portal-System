import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSalesByGroup } from "@/lib/reports";
import { UNSPECIFIED_TYPE_CODE, displayProductTypeCode } from "@/lib/order-preview";
import { startOfMonth, endOfCurrentMonth } from "@/lib/date-utils";
import { deriveOrderPrintState } from "@/lib/order-doc-center";
import { StatusBadge } from "@/components/status-badge";

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

  // Owner UAT Fix Batch — ข้อ 4: Dashboard → Customer → ORDER → Child INV Trace — คำนวณ
  // "ยอดที่ถูกนับใน Dashboard" ต่อ ORDER ด้วย Query เดียวกันเป๊ะกับที่ getSalesByGroup/
  // getDashboard ใช้ภายใน (InvoiceItem.netAmount ของ Invoice ที่ status=PRINTED และ
  // invoiceDate อยู่ในช่วงที่เลือก) แค่ Group ต่อด้วย parentOrderId เพิ่มเอง แทนที่จะ Group
  // ด้วย productType เหมือน groups ด้านบน — ผลรวมของทุก Order ต้องเท่ากับ total.net เป๊ะ
  // เพราะเป็น Partition ของ Invoice ชุดเดียวกัน (ทุก Invoice มี parentOrderId เดียวเสมอ)
  // — Order เป็นแค่ Navigation/Grouping Layer เท่านั้น ไม่ได้เปลี่ยน Sales SOT ไปนับ Order
  // Total โดยตรงแต่อย่างใด (ยังคำนวณจาก InvoiceItem.netAmount ของ Invoice PRINTED ทีละใบ
  // เหมือนเดิมทุกประการ เพียงแต่ Group ผลรวมแสดงต่อ Order ให้ Trace ย้อนกลับได้ง่ายขึ้น)
  const sotItems = await db.invoiceItem.findMany({
    where: {
      invoice: {
        customerId: customer.id,
        status: "PRINTED",
        invoiceDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
      },
    },
    select: { netAmount: true, invoice: { select: { parentOrderId: true } } },
  });
  const sotNetByOrder = new Map<string, number>();
  for (const item of sotItems) {
    const orderId = item.invoice.parentOrderId;
    sotNetByOrder.set(orderId, (sotNetByOrder.get(orderId) ?? 0) + Number(item.netAmount));
  }
  const orderIds = [...sotNetByOrder.keys()];

  const traceOrders = orderIds.length
    ? await db.order.findMany({
        where: { id: { in: orderIds } },
        include: { invoices: { orderBy: { createdAt: "asc" } } },
      })
    : [];
  // เรียงตามยอดที่นับใน Dashboard มาก→น้อย ให้ตรงกับสิ่งที่ Owner สนใจ Trace ก่อน (ยอดใหญ่
  // สุดต้องเจอเร็วที่สุด)
  traceOrders.sort((a, b) => (sotNetByOrder.get(b.id) ?? 0) - (sotNetByOrder.get(a.id) ?? 0));

  return (
    <div className="max-w-2xl">
      <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
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

      {/* Owner UAT Fix Batch — ข้อ 4: Trace ยอดกลับไปถึง ORDER/INV ต้นทาง — Hierarchy
          Customer (หน้านี้อยู่แล้ว) → ORDER → Child INV — ยอด "ที่ถูกนับใน Dashboard" ต่อ
          Order มาจาก Query เดียวกับ Sales SOT เป๊ะ (ดู sotNetByOrder ด้านบน) รวมกันได้เท่ากับ
          total.net พอดี (Invariant เดียวกับตาราง กลุ่มส่วนลด ด้านบน — Partition เดียวกัน
          คนละมุมมอง Group) — Derived Status ใช้ deriveOrderPrintState เดิมจาก Document
          Center ทุกประการ ไม่มี Logic ใหม่ */}
      <h2 className="font-medium text-sm mt-6 mb-2">Trace ยอดขาย: Order → Invoice ต้นทาง</h2>
      <p className="text-xs text-gray-500 mb-2">
        เฉพาะ Order ที่มี Invoice ผ่าน Sales SOT (สถานะพิมพ์แล้ว) ในช่วงวันที่นี้ — ยอดต่อ Order = SUM(Invoice ที่นับใน Dashboard เท่านั้น)
        ส่วน Derived Status สะท้อนสถานะ Invoice ลูกทั้งหมดของ Order ณ ปัจจุบัน (อาจมีใบอื่นที่ยังไม่พิมพ์/อยู่นอกช่วงวันที่นี้ปะปนอยู่)
      </p>

      <div className="bg-white border rounded-lg overflow-hidden divide-y mb-2">
        {traceOrders.map((order) => {
          const printState = deriveOrderPrintState(order.invoices);
          const sotNet = sotNetByOrder.get(order.id) ?? 0;
          return (
            <details key={order.id} className="group">
              <summary className="cursor-pointer list-none hover:bg-gray-50">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <a href={`/orders/${order.id}`} className="font-mono text-blue-600 hover:underline text-sm">
                      {order.orderNumber}
                    </a>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {order.orderDate.toLocaleDateString("th-TH")} · {order.invoices.length} Invoice ลูก
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{money(sotNet)}</span>
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
          รวม {money([...sotNetByOrder.values()].reduce((s, n) => s + n, 0))} — ต้องเท่ากับยอด &quot;รวม&quot; ในตารางด้านบนเป๊ะ (Partition เดียวกัน)
        </p>
      )}
    </div>
  );
}
