import { db } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import type { StatusBadgeConfig } from "@/components/status-badge";

// CP6 Queue-first — หน้า "การขึ้นของและจัดส่ง" = คิวงานที่จะขึ้นของ (ไม่ใช่ list เที่ยวรถ):
// ดึงใบสั่งผลิต active อัตโนมัติ เรียงตามวันที่ต้องการส่ง (สำคัญสุด) — เลขใบผลิตเป็นตัวเล็ก
// อ้างอิงรอง — กดใบไหน = ตรวจของ + ยืนยันขึ้นวันนี้ → เข้าหน้าเตรียมขึ้นของของ "รอบจัดส่ง"

const DATE_MODE_LABEL: Record<string, string> = { UNSET: "ยังไม่กำหนด", ESTIMATE: "ประมาณ", EXACT: "ระบุวัน" };

const QUEUE_BADGE: StatusBadgeConfig = {
  PRODUCING: { label: "กำลังผลิต", className: "bg-green-100 text-green-700" },
  WAITING_PRODUCTION: { label: "รอเริ่มผลิต", className: "bg-blue-100 text-blue-700" },
  LOADING: { label: "กำลังขึ้นของ", className: "bg-amber-100 text-amber-700" },
  PRINTED: { label: "พิมพ์ใบขึ้นของแล้ว · รอบันทึกผล", className: "bg-violet-100 text-violet-700" },
  DISPATCHED: { label: "สินค้าถูกส่งออกแล้ว", className: "bg-green-100 text-green-700" },
};

export default async function LoadingQueuePage() {
  // ใบสั่งผลิต active ทั้งหมด (ออเดอร์ต้นทางไม่ถูกยกเลิก) + สถานะรอบจัดส่งของแต่ละใบ
  const orders = await db.productionOrder.findMany({
    where: { cancelledAt: null, customerPo: { cancelledAt: null } },
    include: {
      customerPo: {
        select: {
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

  // สถานะรอบจัดส่งต่อใบ (drop ในรอบที่ไม่ถูกยกเลิก)
  const drops = await db.loadingDrop.findMany({
    where: { productionOrderId: { in: orders.map((o) => o.id) }, trip: { cancelledAt: null } },
    select: { productionOrderId: true, tripId: true, trip: { select: { reconciledAt: true, sheetPrintedAt: true } } },
  });
  const dropByOrder = new Map(drops.map((d) => [d.productionOrderId!, d]));

  function queueStatus(o: (typeof orders)[number]): { key: string; tripId?: string } {
    const drop = dropByOrder.get(o.id);
    if (drop) {
      if (drop.trip.reconciledAt) return { key: "DISPATCHED", tripId: drop.tripId };
      if (drop.trip.sheetPrintedAt) return { key: "PRINTED", tripId: drop.tripId };
      return { key: "LOADING", tripId: drop.tripId };
    }
    return { key: o.productionStartedAt ? "PRODUCING" : "WAITING_PRODUCTION" };
  }

  // เรียง: งานที่ยังไม่ส่งออกก่อน → ตามวันที่ต้องการ (มีวัน = มาก่อน, เร็วสุดก่อน) → ด่วนก่อน
  const enriched = orders.map((o) => {
    const rev = revByOrder.get(`${o.id}:${o.currentRevNo}`);
    return {
      o,
      status: queueStatus(o),
      itemCount: rev?.items.length ?? 0,
      pieceCount: rev?.items.reduce((s, i) => s + i.qty, 0) ?? 0,
    };
  });
  const active = enriched
    .filter((e) => e.status.key !== "DISPATCHED")
    .sort((a, b) => {
      const da = a.o.customerPo.requestedDate?.getTime() ?? Infinity;
      const dbb = b.o.customerPo.requestedDate?.getTime() ?? Infinity;
      if (da !== dbb) return da - dbb;
      if (a.o.customerPo.urgency !== b.o.customerPo.urgency) return a.o.customerPo.urgency ? -1 : 1;
      return a.o.createdAt.getTime() - b.o.createdAt.getTime();
    });
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
        คิวงานที่จะขึ้นของ เรียงตามวันที่ต้องส่ง — กดออเดอร์เพื่อตรวจของและเริ่มขึ้น ·{" "}
        <a href="/production/loading/trips" className="text-blue-600 hover:underline">ดูรอบจัดส่งทั้งหมด</a>
      </p>

      {active.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500 text-center">ไม่มีงานรอขึ้นของ</div>
      ) : (
        <div className="space-y-2">
          {active.map(({ o, status, itemCount, pieceCount }) => (
            <a
              key={o.id}
              href={status.tripId ? `/production/loading/${status.tripId}` : `/production/loading/start/${o.id}`}
              className="block bg-white border rounded-lg p-3 hover:border-cp-navy"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold min-w-0">
                  {/* วันที่ต้องการ = สำคัญที่สุด */}
                  {o.customerPo.requestedDate ? (
                    <>
                      ส่ง{DATE_MODE_LABEL[o.customerPo.dateMode] === "ประมาณ" ? "ประมาณ " : " "}
                      {o.customerPo.requestedDate.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                    </>
                  ) : (
                    <span className="text-gray-500 font-medium">ยังไม่กำหนดวันส่ง</span>
                  )}
                  {o.customerPo.urgency && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-normal">ด่วน</span>}
                </span>
                <StatusBadge status={status.key} config={QUEUE_BADGE} />
              </div>
              <div className="text-sm text-gray-700 mt-0.5">
                {o.customerPo.customer.companyName}
                {o.customerPo.branch && <span className="text-gray-500"> — {o.customerPo.branch.name}</span>}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {itemCount} รายการ · {pieceCount} ชิ้น
                <span className="text-gray-400 font-mono ml-2">{o.prodNo}</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {dispatched.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-gray-700 mt-6 mb-2">ส่งออกแล้วล่าสุด</h2>
          <div className="space-y-2">
            {dispatched.map(({ o, status, pieceCount }) => (
              <a key={o.id} href={`/production/loading/${status.tripId}`} className="block bg-white border rounded-lg p-3 hover:border-cp-navy opacity-70">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {o.customerPo.customer.companyName}
                    {o.customerPo.branch && <span className="text-gray-500"> — {o.customerPo.branch.name}</span>}
                    <span className="text-xs text-gray-400 font-mono ml-2">{o.prodNo}</span>
                  </span>
                  <StatusBadge status="DISPATCHED" config={QUEUE_BADGE} />
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
