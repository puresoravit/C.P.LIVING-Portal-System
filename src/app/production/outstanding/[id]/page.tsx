import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { BackLink } from "@/components/production/back-link";
import { CutOutstandingButton } from "@/components/production/cut-outstanding-button";

// CP4 — รายละเอียดบัตรค้าง: timeline ภาษาคน "เริ่มค้าง 5 → เที่ยว X ขึ้น 2 → เหลือ 3 → ตัด 1
// → เหลือ 2" พร้อม actor/เวลา/เหตุผล + ลิงก์กลับเที่ยวรถ/ออเดอร์ต้นทาง — ทั้งหมด derive จาก
// ledger append-only (ไม่มีคอลัมน์ mutable ให้ประวัติเพี้ยน)
export default async function OutstandingDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  const card = await db.outstandingDelivery.findUnique({
    where: { id: params.id },
    include: {
      allocations: {
        orderBy: { createdAt: "asc" },
        include: { loadingLine: { select: { drop: { select: { trip: { select: { id: true, tripNo: true } } } } } } },
      },
    },
  });
  if (!card) notFound();

  const line = await db.customerPOLine.findUnique({
    where: { id: card.customerPoLineId },
    include: {
      product: { select: { name: true, productionLabel: true, sku: true } },
      customerPo: {
        select: { id: true, customerId: true, createdAt: true, orderSeqNo: true, cancelledAt: true, customer: { select: { companyName: true } }, branch: { select: { name: true } } },
      },
    },
  });

  const openedFromTrip = card.openedFromTripId
    ? await db.loadingTrip.findUnique({ where: { id: card.openedFromTripId }, select: { id: true, tripNo: true } })
    : null;

  const actorIds = [...new Set([card.openedById, ...card.allocations.map((a) => a.actorId)])];
  const actors = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, username: true } });
  const actorNameById = new Map(actors.map((a) => [a.id, a.displayName || a.username]));

  const delivered = card.allocations.filter((a) => a.kind === "OUTSTANDING").reduce((s, a) => s + a.qty, 0);
  const cut = card.allocations.filter((a) => a.kind === "CUT").reduce((s, a) => s + a.qty, 0);
  const remaining = card.qtyOriginal - delivered - cut;
  const ageDays = Math.floor((Date.now() - card.openedAt.getTime()) / 86400000);
  const productLabel = `${line?.product?.productionLabel ?? line?.product?.name ?? "—"}${line?.size ? ` (ไซส์ ${line.size})` : ""}`;
  const overDemand = !card.closedAt && line ? remaining > Math.max(0, line.qtyCurrent) || !!line.customerPo.cancelledAt : false;

  // timeline: เปิดบัตร → allocation ตามเวลา (ยอดเหลือสะสม)
  let running = card.qtyOriginal;
  const timeline = card.allocations.map((a) => {
    running -= a.qty;
    return { a, after: running };
  });

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref="/production/outstanding" />
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">{productLabel}</h1>
        {card.closedAt ? (
          <span className={`text-xs px-2 py-0.5 rounded-full ${cut > 0 ? "bg-gray-200 text-gray-600" : "bg-green-100 text-green-700"}`}>
            {cut > 0 ? "ปิดแล้ว (มีตัดยอด)" : "ปิดแล้ว (ส่งครบ)"}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">เหลือค้าง {remaining}</span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-3">
        {line?.customerPo.customer.companyName}
        {line?.customerPo.branch && ` — ${line.customerPo.branch.name}`}
        {" · "}
        <a href={`/production/orders/${line?.customerPo.id}`} className="text-blue-600 hover:underline">
          ดูออเดอร์ต้นทาง ({line?.customerPo.createdAt.toLocaleDateString("th-TH")}
          {line?.customerPo.orderSeqNo != null && ` ครั้งที่ ${line.customerPo.orderSeqNo}`})
        </a>
      </p>

      {line?.customerPo.cancelledAt && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2 mb-3">
          ✕ ออเดอร์ต้นทางถูกยกเลิกแล้ว — ของค้างนี้รอผู้ดูแลตัดยอด
        </div>
      )}
      {overDemand && !line?.customerPo.cancelledAt && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2 mb-3">
          ⚠ ยอดค้าง ({remaining}) เกินยอดที่ลูกค้ายังต้องได้ตามออเดอร์ปัจจุบัน ({Math.max(0, line?.qtyCurrent ?? 0)}) — ออเดอร์ถูกแก้ภายหลัง
          ระบบไม่ลดของค้างให้เอง ต้องให้ผู้ดูแลตัดยอดส่วนเกิน
        </div>
      )}

      <div className="bg-white border rounded-lg p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">ค้างตั้งแต่</div>
          <div>{card.openedAt.toLocaleDateString("th-TH")} <span className="text-xs text-gray-400">({ageDays} วัน)</span></div>
        </div>
        <div>
          <div className="text-xs text-gray-500">เดิมค้าง</div>
          <div className="font-semibold">{card.qtyOriginal}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">ขึ้นแล้ว / ตัดแล้ว</div>
          <div><span className="text-green-700 font-semibold">{delivered}</span> / <span className="text-gray-600 font-semibold">{cut}</span></div>
        </div>
        <div>
          <div className="text-xs text-gray-500">เหลือปัจจุบัน</div>
          <div className={`font-semibold ${remaining > 0 ? "text-amber-700" : ""}`}>{remaining}</div>
        </div>
      </div>

      {!card.closedAt && can(role, "outstanding.cancel") && (
        <div className="mb-4">
          <CutOutstandingButton outstandingId={card.id} remaining={remaining} productLabel={productLabel} />
        </div>
      )}
      {!card.closedAt && !can(role, "outstanding.cancel") && (
        <p className="text-xs text-gray-400 mb-4">การตัดยอดค้างทำได้โดยผู้ดูแลระบบเท่านั้น</p>
      )}

      <h2 className="text-sm font-medium text-gray-700 mb-2">ประวัติของค้างนี้</h2>
      <div className="space-y-2">
        <div className="bg-white border rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span>
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1.5" />
              เริ่มค้าง <b>{card.qtyOriginal}</b> ชิ้น
              {openedFromTrip && (
                <>
                  {" — จากเที่ยว "}
                  <a href={`/production/loading/${openedFromTrip.id}`} className="text-blue-600 hover:underline">{openedFromTrip.tripNo}</a>
                </>
              )}
            </span>
            <span className="text-xs text-gray-400 shrink-0">
              {actorNameById.get(card.openedById) ?? ""} · {card.openedAt.toLocaleString("th-TH")}
            </span>
          </div>
        </div>
        {timeline.map(({ a, after }) => (
          <div key={a.id} className="bg-white border rounded-lg p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                {a.kind === "CUT" ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-1.5" />
                    ตัดยอดค้าง <b>{a.qty}</b> ชิ้น{a.reason && <span className="text-gray-500"> — เหตุผล: {a.reason}</span>}
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-600 inline-block mr-1.5" />
                    ขึ้นแล้ว <b>{a.qty}</b> ชิ้น
                    {a.loadingLine?.drop.trip && (
                      <>
                        {" — เที่ยว "}
                        <a href={`/production/loading/${a.loadingLine.drop.trip.id}`} className="text-blue-600 hover:underline">
                          {a.loadingLine.drop.trip.tripNo}
                        </a>
                      </>
                    )}
                  </>
                )}
                {" → เหลือ "}<b>{after}</b>
              </span>
              <span className="text-xs text-gray-400 shrink-0">
                {actorNameById.get(a.actorId) ?? ""} · {a.createdAt.toLocaleString("th-TH")}
              </span>
            </div>
          </div>
        ))}
        {card.closedAt && (
          <div className="bg-white border rounded-lg p-3 text-sm text-gray-600">
            ✓ ปิดบัตรเมื่อ {card.closedAt.toLocaleString("th-TH")} — {cut > 0 ? "มีการตัดยอด (ไม่ใช่ส่งครบทั้งหมด)" : "ส่งครบ"}
          </div>
        )}
      </div>
    </div>
  );
}
