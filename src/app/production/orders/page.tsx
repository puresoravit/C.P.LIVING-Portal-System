import { db } from "@/lib/db";

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
      _count: { select: { lines: { where: { active: true } } } },
    },
    take: 100,
  });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">ออเดอร์ลูกค้า</h1>
        <a href="/production/orders/new" className="bg-cp-navy hover:bg-cp-navy-light text-white text-sm font-medium rounded-lg px-4 py-2">
          + รับ P.O. ใหม่
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">รายการ P.O. ที่รับจากลูกค้า</p>

      {/* Desktop: หัวคอลัมน์คล้ายตาราง (ซ่อนบนมือถือ — มือถือเป็นการ์ด/stack แทน) */}
      <div className="hidden sm:grid grid-cols-[1fr_1fr_80px_100px_90px] gap-3 px-4 py-2 text-xs font-medium text-gray-500 border-b">
        <span>ลูกค้า</span>
        <span>สาขา</span>
        <span className="text-right">รายการ</span>
        <span>วันที่ต้องการ</span>
        <span>สถานะ</span>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden divide-y">
        {orders.map((po) => (
          <a
            key={po.id}
            href={`/production/orders/${po.id}`}
            className="block hover:bg-gray-50"
          >
            <div className="flex flex-col gap-1 px-4 py-3 sm:grid sm:grid-cols-[1fr_1fr_80px_100px_90px] sm:gap-3 sm:items-center">
              <span className="text-sm font-medium text-gray-900">
                {po.customer.companyName}
                {po.urgency && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">ด่วน</span>}
              </span>
              <span className="text-sm text-gray-600">{po.branch?.name ?? "—"}</span>
              <span className="text-xs text-gray-500 sm:text-sm sm:text-right">{po._count.lines} รายการ</span>
              <span className="text-xs text-gray-500 sm:text-sm">{DATE_MODE_LABEL[po.dateMode] ?? po.dateMode}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap w-fit">{po.status}</span>
            </div>
          </a>
        ))}
        {orders.length === 0 && <div className="px-4 py-8 text-center text-gray-400 text-sm">ยังไม่มี P.O. ที่รับไว้</div>}
      </div>
    </div>
  );
}
