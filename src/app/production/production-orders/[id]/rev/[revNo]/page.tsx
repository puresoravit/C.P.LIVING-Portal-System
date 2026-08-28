import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { displayProdNo } from "@/lib/production-order-display";
import { ProductionOrderRevisionView } from "@/components/production/production-order-revision-view";

// S3 CP3 — เปิดดู Revision เก่าแบบ read-only (reconstruct) ใช้ ProductionOrderRevisionView
// เดียวกับหน้า detail ปัจจุบัน พิสูจน์ว่า Revision เก่า "เปิด/reconstruct ได้ครบ" จริง เพราะ
// แถวของ Revision เก่าไม่เคยถูกแตะเลยตั้งแต่ออก Rev ใหม่ (ดู reviseProductionOrder)
export default async function ProductionOrderRevisionHistoryPage(props: { params: Promise<{ id: string; revNo: string }> }) {
  const params = await props.params;
  const revNo = Number(params.revNo);
  if (!Number.isFinite(revNo)) notFound();

  const order = await db.productionOrder.findUnique({
    where: { id: params.id },
    include: { customerPo: { include: { customer: { select: { companyName: true, code: true } }, branch: { select: { name: true } } } } },
  });
  if (!order) notFound();

  const revision = await db.productionOrderRevision.findUnique({
    where: { productionOrderId_revNo: { productionOrderId: order.id, revNo } },
    include: {
      items: {
        include: {
          fabrics: { orderBy: [{ placement: "asc" }, { seq: "asc" }] },
          layers: { orderBy: { seq: "asc" } },
        },
      },
    },
  });
  if (!revision) notFound();

  const actor = await db.user.findUnique({ where: { id: revision.actorId }, select: { displayName: true, username: true } });
  const isCurrent = revNo === order.currentRevNo;

  return (
    <div className="max-w-2xl">
      <a href={`/production/production-orders/${order.id}`} className="text-sm text-blue-600 hover:underline">
        ← กลับไปดูใบสั่งผลิต (Revision ปัจจุบัน)
      </a>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">{displayProdNo(order.prodNo, revNo)}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${isCurrent ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
          {isCurrent ? "Revision ปัจจุบัน" : `Revision เก่า (ปัจจุบันคือ Rev.${order.currentRevNo})`}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-1">
        {order.customerPo.customer.companyName} ({order.customerPo.customer.code})
        {order.customerPo.branch && ` — ${order.customerPo.branch.name}`}
      </p>
      <p className="text-xs text-gray-400 mb-4">
        ออก Rev นี้โดย {actor?.displayName || actor?.username || revision.actorId} เมื่อ {revision.confirmedAt.toLocaleString("th-TH")}
        {revision.reason && ` — เหตุผล: ${revision.reason}`}
      </p>

      <h2 className="text-sm font-medium text-gray-700 mb-2">รายการผลิต ({revision.items.length})</h2>
      <ProductionOrderRevisionView items={revision.items} customerPoId={order.customerPoId} />
    </div>
  );
}
