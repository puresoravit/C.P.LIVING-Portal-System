import { db } from "@/lib/db";
import { deliveryUrgency } from "@/lib/delivery-urgency";

// CP7 round 3 (2026-08-30, Owner UAT) — แยก "บันทึกผลขึ้นของ" ออกเป็นเมนูหลักของตัวเอง (ไม่ใช่
// แค่ section ในหน้าคิว) จึงต้อง factor query+enrich กลางไว้ที่เดียว ให้ /production/loading
// (คิวขึ้นของ ยังไม่พิมพ์) และ /production/loading/results (พิมพ์แล้ว รอบันทึกผล) ใช้สูตร
// เดียวกันเป๊ะ ไม่เสี่ยง derive สถานะเพี้ยนกันระหว่าง 2 หน้า

export type LoadingQueueRow = {
  o: Awaited<ReturnType<typeof fetchOrders>>[number];
  status: { key: string; tripId?: string; mergedCount?: number };
  urgency: ReturnType<typeof deliveryUrgency>;
  itemCount: number;
  pieceCount: number;
};

async function fetchOrders() {
  return db.productionOrder.findMany({
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
}

const URGENCY_RANK: Record<string, number> = { OVERDUE: 0, TODAY: 1, TOMORROW: 2, SOON: 3, LATER: 4, UNSET: 5 };
function byUrgency(a: LoadingQueueRow, b: LoadingQueueRow) {
  const ra = URGENCY_RANK[a.urgency.level];
  const rb = URGENCY_RANK[b.urgency.level];
  if (ra !== rb) return ra - rb;
  if ((a.urgency.daysUntil ?? Infinity) !== (b.urgency.daysUntil ?? Infinity)) return (a.urgency.daysUntil ?? Infinity) - (b.urgency.daysUntil ?? Infinity);
  if (a.o.customerPo.urgency !== b.o.customerPo.urgency) return a.o.customerPo.urgency ? -1 : 1;
  return a.o.createdAt.getTime() - b.o.createdAt.getTime();
}

export async function getLoadingQueueData(): Promise<{
  queue: LoadingQueueRow[];
  awaitingResult: LoadingQueueRow[];
  dispatched: LoadingQueueRow[];
}> {
  const orders = await fetchOrders();

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

  const enriched: LoadingQueueRow[] = orders.map((o) => {
    const rev = revByOrder.get(`${o.id}:${o.currentRevNo}`);
    return {
      o,
      status: queueStatus(o),
      urgency: deliveryUrgency(o.customerPo.requestedDate, o.customerPo.dateMode),
      itemCount: rev?.items.length ?? 0,
      pieceCount: rev?.items.reduce((s, i) => s + i.qty, 0) ?? 0,
    };
  });

  return {
    queue: enriched.filter((e) => e.status.key !== "DISPATCHED" && e.status.key !== "PRINTED").sort(byUrgency),
    awaitingResult: enriched.filter((e) => e.status.key === "PRINTED").sort(byUrgency),
    dispatched: enriched.filter((e) => e.status.key === "DISPATCHED").slice(0, 10),
  };
}
