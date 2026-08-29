import { db } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { customerPoStatusBadge } from "@/lib/production-status-badges";

const DATE_MODE_LABEL: Record<string, string> = {
  UNSET: "ยังไม่กำหนด",
  ESTIMATE: "ประมาณ",
  EXACT: "ระบุชัด",
};

export default async function CustomerOrdersPage() {
  const orders = await db.customerPO.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { companyName: true, code: true } },
      branch: { select: { name: true } },
      _count: { select: { lines: { where: { active: true } }, productionOrders: true } },
    },
    take: 100,
  });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">ออเดอร์ลูกค้า</h1>
        {/* S4 UAT round 5 — Owner: ปุ่มเพิ่มเป็นสีเขียวเข้มพอประมาณ ให้เข้าโทนน้ำเงินของธีม */}
        <a href="/production/orders/new" className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg px-4 py-2">
          + เพิ่มออเดอร์
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">รายการออเดอร์ที่รับจากลูกค้า</p>

      {/* Desktop: หัวคอลัมน์คล้ายตาราง (ซ่อนบนมือถือ — มือถือเป็นการ์ด/stack แทน) */}
      <div className="hidden sm:grid grid-cols-[1fr_1fr_70px_90px_90px_110px] gap-3 px-4 py-2 text-xs font-medium text-gray-500 border-b">
        <span>ลูกค้า</span>
        <span>สาขา</span>
        <span className="text-right">รายการ</span>
        <span>วันที่ลูกค้าออเดอร์</span>
        <span>วันที่ต้องการ</span>
        <span>สถานะ</span>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden divide-y">
        {orders.map((po) => {
          const badge = customerPoStatusBadge(po._count.productionOrders > 0);
          return (
            <a
              key={po.id}
              href={`/production/orders/${po.id}`}
              className="block hover:bg-gray-50"
            >
              <div className="flex flex-col gap-1 px-4 py-3 sm:grid sm:grid-cols-[1fr_1fr_70px_90px_90px_110px] sm:gap-3 sm:items-center">
                <span className="text-sm font-medium text-gray-900">
                  {po.customer.companyName}
                  {po.urgency && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">ด่วน</span>}
                </span>
                <span className="text-sm text-gray-600">{po.branch?.name ?? "—"}</span>
                <span className="text-xs text-gray-500 sm:text-sm sm:text-right">{po._count.lines} รายการ</span>
                <span className="text-xs text-gray-500 sm:text-sm">{po.createdAt.toLocaleDateString("th-TH")}</span>
                <span className="text-xs text-gray-500 sm:text-sm">{DATE_MODE_LABEL[po.dateMode] ?? po.dateMode}</span>
                <span className="w-fit">
                  <StatusBadge {...badge} />
                </span>
              </div>
            </a>
          );
        })}
        {orders.length === 0 && <div className="px-4 py-8 text-center text-gray-400 text-sm">ยังไม่มีออเดอร์ที่รับไว้</div>}
      </div>
    </div>
  );
}
