import type { Prisma, PrismaClient } from "@prisma/client";

// CP3 — demand accounting กลาง ใช้ทั้งใน transaction ของ reconcile (server action) และตอน
// ประกอบข้อมูลหน้าจอ reconcile — สูตรเดียว ไม่มีสองเวอร์ชันให้เบี้ยวกัน
//
// capacity (ตัดเป็น "ออเดอร์ใหม่" ได้สูงสุด) = qtyCurrent − handled − openRemaining โดย
//   handled       = FRESH ที่ส่งแล้ว + (OUTSTANDING+CUT) ของบัตรทุกใบที่ผูกบรรทัดนี้
//   openRemaining = ยอดคงเหลือของบัตร OPEN (demand ส่วนนั้นถูกติดตามในบัตรอยู่แล้ว ห้ามนับซ้ำ)
// ออเดอร์ที่ถูกยกเลิก (CP0) หรือบรรทัด inactive → demand = 0 (lock 3: cancelled ห้ามสร้าง
// demand/outstanding ใหม่) — Production qty ไม่อยู่ในสูตรนี้โดยเจตนา (เป็น context เตือนเท่านั้น)

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function freshCapacityFor(
  dbc: DbClient,
  customerPoLineId: string
): Promise<{ capacity: number; qtyCurrent: number; cancelled: boolean }> {
  const line = await dbc.customerPOLine.findUniqueOrThrow({
    where: { id: customerPoLineId },
    select: { qtyCurrent: true, active: true, customerPo: { select: { cancelledAt: true } } },
  });
  if (line.customerPo.cancelledAt || !line.active) return { capacity: 0, qtyCurrent: line.qtyCurrent, cancelled: true };

  const freshDelivered = await dbc.loadingAllocation.aggregate({
    where: { kind: "FRESH", customerPoLineId },
    _sum: { qty: true },
  });
  const viaOutstanding = await dbc.loadingAllocation.aggregate({
    where: { kind: { in: ["OUTSTANDING", "CUT"] }, outstanding: { customerPoLineId } },
    _sum: { qty: true },
  });
  const openOutstandings = await dbc.outstandingDelivery.findMany({
    where: { customerPoLineId, closedAt: null },
    select: { qtyOriginal: true, allocations: { select: { qty: true } } },
  });
  const openRemaining = openOutstandings.reduce((s, o) => s + o.qtyOriginal - o.allocations.reduce((x, a) => x + a.qty, 0), 0);
  const handled = (freshDelivered._sum.qty ?? 0) + (viaOutstanding._sum.qty ?? 0);
  return { capacity: Math.max(0, line.qtyCurrent - handled - openRemaining), qtyCurrent: line.qtyCurrent, cancelled: false };
}

/** ยอดคงเหลือของบัตรค้าง (derive จาก ledger เสมอ — ไม่มี mutable remaining ให้ drift) */
export function outstandingRemaining(o: { qtyOriginal: number; allocations: { qty: number }[] }): number {
  return o.qtyOriginal - o.allocations.reduce((s, a) => s + a.qty, 0);
}
