import { db } from "@/lib/db";
import { deliveryUrgency } from "@/lib/delivery-urgency";
import { displayProdNo } from "@/lib/production-order-display";

// CP7 round 3 (2026-08-30, Owner UAT) — แยก "บันทึกผลขึ้นของ" ออกเป็นเมนูหลักของตัวเอง (ไม่ใช่
// แค่ section ในหน้าคิว) จึงต้อง factor query+enrich กลางไว้ที่เดียว ให้ /production/loading
// (คิวขึ้นของ ยังไม่พิมพ์) และ /production/loading/results (พิมพ์แล้ว รอบันทึกผล) ใช้สูตร
// เดียวกันเป๊ะ ไม่เสี่ยง derive สถานะเพี้ยนกันระหว่าง 2 หน้า

export type LoadingQueueRow = {
  o: Awaited<ReturnType<typeof fetchOrders>>[number];
  status: { key: string; tripId?: string; tripNo?: string; mergedCount?: number; reconciledAt?: Date | null };
  urgency: ReturnType<typeof deliveryUrgency>;
  itemCount: number;
  pieceCount: number;
};

// CP7 round 12 (Owner UAT) — หลังพิมพ์ใบ (PRINTED) กับหลังส่งออกแล้ว (DISPATCHED) ทั้งรอบ
// จัดส่งคือหน่วยเดียวกัน (finalize บันทึกทุกใบผลิตในรอบพร้อมกันครั้งเดียว ไม่มี concept
// "บันทึกผลบางใบ") — ต่างจาก queue (ก่อนพิมพ์) ที่ยังปล่อยให้ลาก/ถอดออกจากกันได้ทีละใบ จึง
// ยังคงแสดงเป็นการ์ดแยกต่อใบผลิตตามเดิม — awaitingResult/dispatched ข้างล่างนี้จึงต้อง
// จัดกลุ่มตาม tripId ให้เหลือ 1 การ์ดต่อ 1 รอบจัดส่งจริง (ก่อนหน้านี้โชว์ซ้ำเป็นการ์ดแยก
// ต่อใบผลิต ทั้งที่กดการ์ดไหนก็พาไปหน้าเดียวกันเป๊ะ — สร้างความสับสนว่าทำไมมี 2 การ์ด)
export type LoadingTripGroup = {
  tripId: string;
  tripNo: string;
  urgency: ReturnType<typeof deliveryUrgency>;
  customerLabel: string;
  mergedCount: number;
  prodNos: string[];
  itemCount: number;
  pieceCount: number;
  reconciledAt: Date | null;
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

// จัดกลุ่มการ์ดที่มี tripId เดียวกันให้เหลือ 1 การ์ด — เลือก urgency ที่เร่งด่วนที่สุดในกลุ่ม
// เป็นตัวแทน, รวม prodNo/จำนวนทุกใบผลิตในรอบเดียวกัน, และสร้างชื่อลูกค้าที่แสดงผลตามจริง
// (ลูกค้าเดียวกันทุกใบ = โชว์ชื่อเดียว, ต่างกัน = โชว์ชื่อแรก + "และอีก N ราย" — Owner ยืนยัน
// ค่อยปรับคำได้ทีหลังถ้าไม่ตรงใจ กรณีนี้ยังไม่เคยเจอในข้อมูลจริง)
function groupByTrip(rows: LoadingQueueRow[]): LoadingTripGroup[] {
  const byTrip = new Map<string, LoadingQueueRow[]>();
  for (const row of rows) {
    const tripId = row.status.tripId;
    if (!tripId) continue;
    const list = byTrip.get(tripId) ?? [];
    list.push(row);
    byTrip.set(tripId, list);
  }
  const groups: LoadingTripGroup[] = [];
  for (const [tripId, groupRows] of byTrip) {
    const first = groupRows[0];
    const distinctCustomers = [...new Set(groupRows.map((r) => r.o.customerPo.customer.companyName))];
    const distinctBranches = [...new Set(groupRows.map((r) => r.o.customerPo.branch?.name ?? null))];
    let customerLabel: string;
    if (distinctCustomers.length === 1) {
      customerLabel = distinctBranches.length === 1 && distinctBranches[0] ? `${distinctCustomers[0]} — ${distinctBranches[0]}` : distinctCustomers[0];
    } else {
      customerLabel = distinctCustomers.length > 1 ? `${distinctCustomers[0]} และอีก ${distinctCustomers.length - 1} ราย` : distinctCustomers[0];
    }
    const mostUrgent = groupRows.reduce((a, b) => (byUrgency(a, b) <= 0 ? a : b));
    groups.push({
      tripId,
      tripNo: first.status.tripNo ?? "",
      urgency: mostUrgent.urgency,
      customerLabel,
      mergedCount: first.status.mergedCount ?? groupRows.length,
      prodNos: groupRows.map((r) => displayProdNo(r.o.prodNo, r.o.currentRevNo)),
      itemCount: groupRows.reduce((s, r) => s + r.itemCount, 0),
      pieceCount: groupRows.reduce((s, r) => s + r.pieceCount, 0),
      reconciledAt: first.status.reconciledAt ?? null,
    });
  }
  return groups;
}

export async function getLoadingQueueData(): Promise<{
  queue: LoadingQueueRow[];
  awaitingResult: LoadingTripGroup[];
  dispatched: LoadingTripGroup[];
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
    select: { productionOrderId: true, tripId: true, trip: { select: { tripNo: true, reconciledAt: true, sheetPrintedAt: true } } },
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

  function queueStatus(o: (typeof orders)[number]): LoadingQueueRow["status"] {
    const drop = dropByOrder.get(o.id);
    if (drop) {
      if (drop.trip.reconciledAt) return { key: "DISPATCHED", tripId: drop.tripId, tripNo: drop.trip.tripNo, reconciledAt: drop.trip.reconciledAt };
      const mergedCount = mergedOrderCountByTrip.get(drop.tripId) ?? 1;
      if (drop.trip.sheetPrintedAt) return { key: "PRINTED", tripId: drop.tripId, tripNo: drop.trip.tripNo, mergedCount };
      return { key: "PREPARING", tripId: drop.tripId, tripNo: drop.trip.tripNo, mergedCount };
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

  const awaitingResultGroups = groupByTrip(enriched.filter((e) => e.status.key === "PRINTED")).sort(
    (a, b) => URGENCY_RANK[a.urgency.level] - URGENCY_RANK[b.urgency.level] || (a.urgency.daysUntil ?? Infinity) - (b.urgency.daysUntil ?? Infinity)
  );
  const dispatchedGroups = groupByTrip(enriched.filter((e) => e.status.key === "DISPATCHED"))
    .sort((a, b) => (b.reconciledAt?.getTime() ?? 0) - (a.reconciledAt?.getTime() ?? 0))
    .slice(0, 10);

  return {
    queue: enriched.filter((e) => e.status.key !== "DISPATCHED" && e.status.key !== "PRINTED").sort(byUrgency),
    awaitingResult: awaitingResultGroups,
    dispatched: dispatchedGroups,
  };
}
