import { db } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import type { StatusBadgeConfig } from "@/components/status-badge";
import { deliveryUrgency } from "@/lib/delivery-urgency";
import { PullForwardButton } from "@/components/production/pull-forward-button";

// CP6 Queue-first — หน้า "การขึ้นของและจัดส่ง" = คิวงานที่จะขึ้นของ (ไม่ใช่ list เที่ยวรถ):
// ดึงใบสั่งผลิต active อัตโนมัติ เรียงตามวันที่ต้องการส่ง (สำคัญสุด) — เลขใบผลิตเป็นตัวเล็ก
// อ้างอิงรอง — กดใบไหน = ตรวจของ + ยืนยันขึ้นวันนี้ → เข้าหน้าเตรียมขึ้นของของ "รอบจัดส่ง"
//
// CP7 (2026-08-30, Owner UAT) — badge ความเร่งด่วนตามวันส่งแยกจาก badge สถานะงาน · "กำลังขึ้น
// ของ" เกิดหลังพิมพ์ใบแล้วเท่านั้น (ก่อนพิมพ์ = "เตรียมขึ้นของ")
//
// CP7 round 2 (2026-08-30, Owner UAT) — แยกเป็น 3 หมวดชัดเจนตาม mental model:
// "คิวขึ้นของ" (ยังไม่พิมพ์) → "รอบันทึกผล" (พิมพ์แล้ว กดแล้วเข้าฟอร์มบันทึกผลตรงๆ ไม่ผ่าน
// หน้ารอบจัดส่งอีกที — เดิมฝัง "บันทึกผลขึ้นของ" ไว้ลึกในหน้ารอบจัดส่งซึ่ง Owner บอกว่าลึกเกิน)
// → "ส่งออกแล้วล่าสุด" (เดิม) · เพิ่มปุ่ม "ส่งวันนี้แทน" ต่อการ์ด (ทางลัดแทน drag-and-drop
// ซึ่งซับซ้อนเกินไปบนมือถือ — เป้าหมายเดียวกันคือดึงออเดอร์ที่ผลิตเสร็จเร็วมาส่งวันนี้)

const QUEUE_BADGE: StatusBadgeConfig = {
  PRODUCING: { label: "กำลังผลิต", className: "bg-green-100 text-green-700" },
  WAITING_PRODUCTION: { label: "รอเริ่มผลิต", className: "bg-blue-100 text-blue-700" },
  PREPARING: { label: "เตรียมขึ้นของ", className: "bg-blue-100 text-blue-700" },
};

export default async function LoadingQueuePage() {
  // ใบสั่งผลิต active ทั้งหมด (ออเดอร์ต้นทางไม่ถูกยกเลิก) + สถานะรอบจัดส่งของแต่ละใบ
  const orders = await db.productionOrder.findMany({
    where: { cancelledAt: null, customerPo: { cancelledAt: null } },
    include: {
      customerPo: {
        select: {
          version: true,
          requestedDate: true,
          dateMode: true,
          urgency: true,
          customer: { select: { companyName: true } },
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // รายการ/จำนวนชิ้นจาก Rev ปัจจุบันของแต่ละใบ
  const revKeys = orders.map((o) => ({ productionOrderId: o.id, revNo: o.currentRevNo }));
  const revisions = revKeys.length
    ? await db.productionOrderRevision.findMany({
        where: { OR: revKeys },
        select: { productionOrderId: true, revNo: true, items: { select: { qty: true } } },
      })
    : [];
  const revByOrder = new Map(revisions.map((r) => [`${r.productionOrderId}:${r.revNo}`, r]));

  // สถานะรอบจัดส่งต่อใบ (drop ในรอบที่ไม่ถูกยกเลิก) — ดึงทุก drop ของรอบเหล่านั้นด้วยเพื่อนับ
  // ว่ารอบไหนรวมหลายใบผลิตเข้าด้วยกัน (merge indicator)
  const myDrops = await db.loadingDrop.findMany({
    where: { productionOrderId: { in: orders.map((o) => o.id) }, trip: { cancelledAt: null } },
    select: { productionOrderId: true, tripId: true, trip: { select: { reconciledAt: true, sheetPrintedAt: true } } },
  });
  const dropByOrder = new Map(myDrops.map((d) => [d.productionOrderId!, d]));
  const tripIds = [...new Set(myDrops.map((d) => d.tripId))];
  const mergedOrderCountByTrip = new Map<string, number>();
  if (tripIds.length) {
    const allDropsInThoseTrips = await db.loadingDrop.findMany({
      where: { tripId: { in: tripIds } },
      select: { tripId: true, productionOrderId: true },
    });
    for (const tid of tripIds) {
      const distinctOrders = new Set(allDropsInThoseTrips.filter((d) => d.tripId === tid && d.productionOrderId).map((d) => d.productionOrderId));
      mergedOrderCountByTrip.set(tid, distinctOrders.size);
    }
  }

  function queueStatus(o: (typeof orders)[number]): { key: string; tripId?: string; mergedCount?: number } {
    const drop = dropByOrder.get(o.id);
    if (drop) {
      if (drop.trip.reconciledAt) return { key: "DISPATCHED", tripId: drop.tripId };
      const mergedCount = mergedOrderCountByTrip.get(drop.tripId) ?? 1;
      if (drop.trip.sheetPrintedAt) return { key: "PRINTED", tripId: drop.tripId, mergedCount };
      return { key: "PREPARING", tripId: drop.tripId, mergedCount };
    }
    return { key: o.productionStartedAt ? "PRODUCING" : "WAITING_PRODUCTION" };
  }

  const enriched = orders.map((o) => {
    const rev = revByOrder.get(`${o.id}:${o.currentRevNo}`);
    return {
      o,
      status: queueStatus(o),
      urgency: deliveryUrgency(o.customerPo.requestedDate, o.customerPo.dateMode),
      itemCount: rev?.items.length ?? 0,
      pieceCount: rev?.items.reduce((s, i) => s + i.qty, 0) ?? 0,
    };
  });
  const URGENCY_RANK: Record<string, number> = { OVERDUE: 0, TODAY: 1, TOMORROW: 2, SOON: 3, LATER: 4, UNSET: 5 };
  function byUrgency(a: (typeof enriched)[number], b: (typeof enriched)[number]) {
    const ra = URGENCY_RANK[a.urgency.level];
    const rb = URGENCY_RANK[b.urgency.level];
    if (ra !== rb) return ra - rb;
    if ((a.urgency.daysUntil ?? Infinity) !== (b.urgency.daysUntil ?? Infinity)) return (a.urgency.daysUntil ?? Infinity) - (b.urgency.daysUntil ?? Infinity);
    if (a.o.customerPo.urgency !== b.o.customerPo.urgency) return a.o.customerPo.urgency ? -1 : 1;
    return a.o.createdAt.getTime() - b.o.createdAt.getTime();
  }

  // 3 หมวด: คิวขึ้นของ (ยังไม่พิมพ์) / รอบันทึกผล (พิมพ์แล้ว) / ส่งออกแล้วล่าสุด
  const queue = enriched.filter((e) => e.status.key !== "DISPATCHED" && e.status.key !== "PRINTED").sort(byUrgency);
  const awaitingResult = enriched.filter((e) => e.status.key === "PRINTED").sort(byUrgency);
  const dispatched = enriched.filter((e) => e.status.key === "DISPATCHED").slice(0, 10);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">การขึ้นของและจัดส่ง</h1>
        <a href="/production/loading/start-stock" className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg px-4 py-2">
          + เพิ่มรายการขึ้นของ
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        เรียงตามความเร่งด่วน — กดออเดอร์เพื่อตรวจของและเริ่มขึ้น ·{" "}
        <a href="/production/loading/trips" className="text-blue-600 hover:underline">ดูรอบจัดส่งทั้งหมด</a>
      </p>

      <h2 className="text-sm font-semibold text-gray-700 mb-2">คิวขึ้นของ</h2>
      {queue.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500 text-center">ไม่มีงานรอขึ้นของ</div>
      ) : (
        <div className="space-y-2">
          {queue.map(({ o, status, urgency, itemCount, pieceCount }) => (
            <a
              key={o.id}
              href={status.tripId ? `/production/loading/${status.tripId}` : `/production/loading/start/${o.id}`}
              className="block bg-white border rounded-lg p-3 hover:border-cp-navy"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urgency.className}`}>{urgency.label}</span>
                <div className="flex items-center gap-1.5">
                  {urgency.level !== "TODAY" && urgency.level !== "OVERDUE" && (
                    <PullForwardButton customerPoId={o.customerPoId} version={o.customerPo.version} dateLabel={urgency.label} />
                  )}
                  <StatusBadge status={status.key} config={QUEUE_BADGE} />
                </div>
              </div>
              <div className="text-sm text-gray-700 mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="font-medium">{o.customerPo.customer.companyName}</span>
                {o.customerPo.branch && <span className="text-gray-500">— {o.customerPo.branch.name}</span>}
                {o.customerPo.urgency && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">ด่วน</span>}
                {status.mergedCount != null && status.mergedCount > 1 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">รวม {status.mergedCount} ใบผลิต</span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {itemCount} รายการ · {pieceCount} ชิ้น
                <span className="text-gray-400 font-mono ml-2">{o.prodNo}</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* CP7 round 2 — "รอบันทึกผล" หมวดแยกชัด: พิมพ์ใบแล้ว กดแล้วเข้าฟอร์มบันทึกผลตรงๆ */}
      {awaitingResult.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mt-6 mb-2">รอบันทึกผล</h2>
          <div className="space-y-2">
            {awaitingResult.map(({ o, status, urgency, itemCount, pieceCount }) => (
              <a
                key={o.id}
                href={`/production/loading/${status.tripId}/finalize`}
                className="block bg-white border-2 border-amber-300 rounded-lg p-3 hover:border-amber-500"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urgency.className}`}>{urgency.label}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">พิมพ์แล้ว · รอบันทึกผล</span>
                </div>
                <div className="text-sm text-gray-700 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium">{o.customerPo.customer.companyName}</span>
                  {o.customerPo.branch && <span className="text-gray-500">— {o.customerPo.branch.name}</span>}
                  {status.mergedCount != null && status.mergedCount > 1 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">รวม {status.mergedCount} ใบผลิต</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {itemCount} รายการ · {pieceCount} ชิ้น
                  <span className="text-gray-400 font-mono ml-2">{o.prodNo}</span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {dispatched.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-gray-700 mt-6 mb-2">ส่งออกแล้วล่าสุด</h2>
          <div className="space-y-2">
            {dispatched.map(({ o, status }) => (
              <a key={o.id} href={`/production/loading/${status.tripId}`} className="block bg-white border rounded-lg p-3 hover:border-cp-navy opacity-70">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {o.customerPo.customer.companyName}
                    {o.customerPo.branch && <span className="text-gray-500"> — {o.customerPo.branch.name}</span>}
                    <span className="text-xs text-gray-400 font-mono ml-2">{o.prodNo}</span>
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">สินค้าถูกส่งออกแล้ว</span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
