import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { displayProdNo } from "@/lib/production-order-display";
import { ProductionOrderRevisionView } from "@/components/production/production-order-revision-view";

// S3 CP2 — หน้ารายละเอียดใบสั่งผลิต แสดง Revision ปัจจุบัน (currentRevNo) แบบจัดกลุ่มตาม
// specHash (Production Block) ผ่าน ProductionOrderRevisionView ที่ใช้ร่วมกับหน้าดู
// Revision เก่า (CP3 — ดู [id]/rev/[revNo]/page.tsx)
export default async function ProductionOrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const order = await db.productionOrder.findUnique({
    where: { id: params.id },
    include: {
      customerPo: { include: { customer: { select: { companyName: true, code: true } }, branch: { select: { name: true } } } },
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

  return (
    <div className="max-w-2xl">
      <a href={`/production/orders/${order.customerPoId}`} className="text-sm text-blue-600 hover:underline">
        ← กลับไปดู P.O. ต้นทาง
      </a>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">{displayProdNo(order.prodNo, order.currentRevNo)}</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{order.status}</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {order.customerPo.customer.companyName} ({order.customerPo.customer.code})
        {order.customerPo.branch && ` — ${order.customerPo.branch.name}`}
      </p>

      <h2 className="text-sm font-medium text-gray-700 mb-2">รายการผลิต ({currentRevision?.items.length ?? 0})</h2>
      {currentRevision && <ProductionOrderRevisionView items={currentRevision.items} customerPoId={order.customerPoId} />}
    </div>
  );
}
