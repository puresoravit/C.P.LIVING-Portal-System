import { db } from "@/lib/db";
import { displayProdNo } from "@/lib/production-order-display";
import { StatusBadge } from "@/components/status-badge";
import { productionOrderStatusBadge } from "@/lib/production-status-badges";
import { getProductionSettings } from "@/lib/production-settings";

// S3 CP1 — แทนที่ stub เดิม รายการใบสั่งผลิตทั้งหมด (ทุกลูกค้า) — สร้างได้จากปุ่มบนหน้า
// CustomerPO detail เท่านั้น หน้านี้จึงไม่มีปุ่ม "+ สร้างใหม่" ของตัวเอง
export default async function ProductionOrdersPage() {
  const [orders, settings] = await Promise.all([
    db.productionOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customerPo: { include: { customer: { select: { companyName: true, code: true } }, branch: { select: { name: true } } } },
        _count: { select: { revisions: true } },
      },
      take: 100,
    }),
    getProductionSettings(),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">ใบสั่งผลิต</h1>
      <p className="text-sm text-gray-500 mb-4">สร้างได้จากหน้ารายละเอียดออเดอร์ลูกค้าแต่ละใบ</p>

      {orders.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500">ยังไม่มีใบสั่งผลิต</div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const badge = productionOrderStatusBadge(!!order.productionStartedAt, settings, !!order.cancelledAt);
            return (
              <a
                key={order.id}
                href={`/production/production-orders/${order.id}`}
                className="block bg-white border rounded-lg p-3 hover:border-cp-navy sm:flex sm:items-center sm:justify-between sm:gap-3"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">{displayProdNo(order.prodNo, order.currentRevNo)}</span>
                  <span className="ml-2 align-middle">
                    <StatusBadge {...badge} />
                  </span>
                </div>
                <div className="text-sm text-gray-600 mt-1 sm:mt-0">
                  {order.customerPo.customer.companyName}
                  {order.customerPo.branch && ` — ${order.customerPo.branch.name}`}
                </div>
                <div className="text-xs text-gray-400 mt-1 sm:mt-0">{order.createdAt.toLocaleDateString("th-TH")}</div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
