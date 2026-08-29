import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { displayProdNo } from "@/lib/production-order-display";
import { ProductionOrderRevisionView } from "@/components/production/production-order-revision-view";

// S3 CP2/CP3 — หน้ารายละเอียดใบสั่งผลิต แสดง Revision ปัจจุบัน (currentRevNo) แบบจัดกลุ่มตาม
// specHash (Production Block) ผ่าน ProductionOrderRevisionView ที่ใช้ร่วมกับหน้าดู
// Revision เก่า (CP3 — [id]/rev/[revNo]/page.tsx) + ปุ่มออก Rev ใหม่ + ประวัติ Revision
export default async function ProductionOrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const order = await db.productionOrder.findUnique({
    where: { id: params.id },
    include: {
      customerPo: { include: { customer: { select: { companyName: true, code: true } }, branch: { select: { name: true } } } },
      revisions: {
        orderBy: { revNo: "desc" },
        select: { id: true, revNo: true, confirmedAt: true, reason: true, actorId: true },
      },
    },
  });
  if (!order) notFound();

  const currentRevision = await db.productionOrderRevision.findUnique({
    where: { productionOrderId_revNo: { productionOrderId: order.id, revNo: order.currentRevNo } },
    include: {
      items: {
        include: {
          fabrics: { orderBy: [{ placement: "asc" }, { seq: "asc" }] },
          layers: { orderBy: { seq: "asc" } },
        },
      },
    },
  });

  const actorIds = [...new Set(order.revisions.map((r) => r.actorId))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, username: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.displayName || a.username]));

  return (
    <div className="max-w-2xl">
      <a href={`/production/orders/${order.customerPoId}`} className="text-sm text-blue-600 hover:underline">
        ← กลับไปดู P.O. ต้นทาง
      </a>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">{displayProdNo(order.prodNo, order.currentRevNo)}</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{order.status}</span>
      </div>
      <p className="text-sm text-gray-500 mb-1">
        {order.customerPo.customer.companyName} ({order.customerPo.customer.code})
        {order.customerPo.branch && ` — ${order.customerPo.branch.name}`}
      </p>

      <div className="flex items-center gap-2 mb-4">
        <a
          href={`/production/production-orders/${order.id}/print`}
          className="inline-block text-xs px-2 py-0.5 rounded-full bg-cp-navy text-white hover:bg-cp-navy-light"
        >
          พิมพ์ใบสั่งผลิต
        </a>
        <a
          href={`/production/production-orders/${order.id}/revise`}
          className="inline-block text-xs px-2 py-0.5 rounded-full border border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          ออก Revision ใหม่
        </a>
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">รายการผลิต ({currentRevision?.items.length ?? 0})</h2>
      {currentRevision && <ProductionOrderRevisionView items={currentRevision.items} customerPoId={order.customerPoId} />}

      {order.revisions.length > 1 && (
        <>
          <h2 className="text-sm font-medium text-gray-700 mt-6 mb-2">ประวัติ Revision ({order.revisions.length})</h2>
          <div className="space-y-2">
            {order.revisions.map((rev) => (
              <a
                key={rev.id}
                href={`/production/production-orders/${order.id}/rev/${rev.revNo}`}
                className={`flex items-center justify-between bg-white border rounded-lg p-3 text-sm ${rev.revNo === order.currentRevNo ? "border-blue-300" : "hover:border-cp-navy"}`}
              >
                <span>
                  <span className="font-medium">Rev.{rev.revNo}</span>
                  {rev.revNo === order.currentRevNo && <span className="ml-1.5 text-xs text-blue-600">(ปัจจุบัน)</span>}
                  {rev.reason && <span className="text-gray-500 ml-2">— {rev.reason}</span>}
                </span>
                <span className="text-xs text-gray-400">
                  {actorNameById.get(rev.actorId) ?? rev.actorId} · {rev.confirmedAt.toLocaleString("th-TH")}
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
