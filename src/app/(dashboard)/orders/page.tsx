import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "order.create")) redirect("/");

  const orders = await db.order.findMany({
    include: { customer: true, branch: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">ออเดอร์ขาย (Sales Order)</h1>
        <a
          href="/orders/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          + สร้างออเดอร์ใหม่
        </a>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่ออเดอร์</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">สาขา</th>
              <th className="px-4 py-2 font-medium">รายการ</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const status = STATUS_LABEL[o.status];
              return (
                <tr key={o.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <a href={`/orders/${o.id}`} className="font-mono text-blue-600 hover:underline">
                      {o.orderNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2">{o.orderDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2">{o.customer.companyName}</td>
                  <td className="px-4 py-2">{o.branch.name}</td>
                  <td className="px-4 py-2">{o._count.items} รายการ</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีออเดอร์
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
