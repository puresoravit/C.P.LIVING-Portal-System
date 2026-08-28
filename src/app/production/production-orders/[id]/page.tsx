import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { displayProdNo } from "@/lib/production-order-display";

// S3 CP1 — หน้ารายละเอียดใบสั่งผลิต แสดงเฉพาะ Revision ปัจจุบัน (currentRevNo) — ยังไม่มี UI
// ดู Rev เก่า/revise/print ในรอบนี้ (CP3/S4)

export default async function ProductionOrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const order = await db.productionOrder.findUnique({
    where: { id: params.id },
    include: {
      customerPo: { include: { customer: { select: { companyName: true, code: true } }, branch: { select: { name: true } } } },
      revisions: {
        orderBy: { revNo: "desc" },
        take: 1,
        include: {
          items: {
            include: {
              fabrics: { orderBy: [{ placement: "asc" }, { seq: "asc" }] },
              layers: { orderBy: { seq: "asc" } },
              customerPoLine: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!order) notFound();

  const currentRevision = order.revisions.find((r) => r.revNo === order.currentRevNo) ?? order.revisions[0];

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
      <div className="space-y-3">
        {currentRevision?.items.map((item) => (
          <div key={item.id} className="bg-white border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">
                  {item.productionLabelSnapshot ?? item.nameSnapshot ?? "—"}
                  {item.size && <span className="text-gray-500"> (ไซส์ {item.size})</span>}
                </div>
                {item.skuSnapshot && <div className="text-xs text-gray-400 font-mono">{item.skuSnapshot}</div>}
                {item.customerPoLine && (
                  <a href={`/production/orders/${order.customerPoId}`} className="text-xs text-blue-600 hover:underline">
                    ย้อนไปดูรายการต้นทางใน P.O.
                  </a>
                )}
              </div>
              <div className="text-lg font-semibold shrink-0">{item.qty}</div>
            </div>

            <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
              {item.gussetCount != null && <span>กุ๊น {item.gussetCount}</span>}
              {item.thickness && <span>ความหนา {item.thickness}</span>}
              <span className="font-mono text-gray-300" title="spec_hash">
                {item.specHash.slice(0, 12)}
              </span>
            </div>

            <div className="text-xs">
              <div className="text-gray-500 mb-0.5">ผ้า</div>
              <ul className="space-y-0.5">
                {item.fabrics.map((f) => (
                  <li key={f.id}>
                    <span className="font-medium">{f.placement}</span>: {f.displayOverride ?? f.fabricName}
                    {f.waddingWeight && ` + ใย ${f.waddingWeight}`}
                    {f.foamThickness && ` + ฟ.${f.foamThickness}`}
                    {f.colorNote && ` (${f.colorNote})`}
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-xs">
              <div className="text-gray-500 mb-0.5">โครงสร้าง (บนลงล่าง)</div>
              <ol className="list-decimal list-inside space-y-0.5">
                {item.layers.map((l) => (
                  <li key={l.id}>{l.displayOverride ?? `${l.material} ${l.spec}`}</li>
                ))}
              </ol>
            </div>

            {item.note && <div className="text-xs text-gray-500">หมายเหตุ: {item.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
