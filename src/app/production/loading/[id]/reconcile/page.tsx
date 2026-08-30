import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { freshCapacityFor, outstandingRemaining } from "@/lib/loading-reconcile";
import { BackLink } from "@/components/production/back-link";
import { ReconcileForm, type ReconcileData } from "@/components/production/reconcile-form";

// CP3 — หน้ากระทบยอด: คนเห็นสามฝั่งชัด "ของที่ขึ้นจริง → จะตัดจากอะไร → หลังตัดแล้วเหลืออะไร"
// ภาษาหน้างานล้วน (ไม่มีคำว่า allocation ให้ผู้ใช้ต้องเข้าใจ) — server action ตรวจซ้ำทุกกติกา
export default async function ReconcilePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  const trip = await db.loadingTrip.findUnique({
    where: { id: params.id },
    include: { drops: { orderBy: { seq: "asc" }, include: { lines: { orderBy: { id: "asc" } } } } },
  });
  if (!trip) notFound();

  const eligible = trip.loadedAt && !trip.reconciledAt && !trip.cancelledAt && can(role, "loadingTrip.manage");
  if (!eligible) {
    return (
      <div className="max-w-2xl">
        <BackLink fallbackHref={`/production/loading/${trip.id}`} />
        <div className="mt-3 bg-white border border-dashed rounded-lg p-4 text-sm text-gray-500">
          กระทบยอดได้เฉพาะเที่ยวที่ยืนยันขึ้นของแล้วและยังไม่ถูกกระทบยอด/ยกเลิก — หรือคุณไม่มีสิทธิ์
        </div>
      </div>
    );
  }

  const customerIds = [...new Set(trip.drops.map((d) => d.customerId))];
  const customers = await db.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, companyName: true } });
  const customerNameById = new Map(customers.map((c) => [c.id, c.companyName]));

  // demand context ต่อ customerPoLineId ที่เที่ยวนี้แตะ: capacity (ตัดออเดอร์ใหม่ได้สูงสุด) +
  // ยอดสั่งปัจจุบัน + ยอดสั่งผลิตล่าสุด (context เตือนเมื่อไม่เท่ากัน — ห้ามใช้สร้างของค้าง)
  const poLineIds = [...new Set(trip.drops.flatMap((d) => d.lines.map((l) => l.customerPoLineId)).filter((v): v is string => !!v))];
  const capacityByPoLine: ReconcileData["capacityByPoLine"] = {};
  for (const id of poLineIds) {
    const c = await freshCapacityFor(db, id);
    capacityByPoLine[id] = { capacity: c.capacity, qtyCurrent: c.qtyCurrent, cancelled: c.cancelled, productionQty: null };
  }
  if (poLineIds.length) {
    // ยอดสั่งผลิตของ Rev ปัจจุบัน (เฉพาะใบสั่งผลิตที่ไม่ถูกยกเลิก) — context เท่านั้น
    const prodItems = await db.productionItem.findMany({
      where: { customerPoLineId: { in: poLineIds }, revision: { productionOrder: { cancelledAt: null } } },
      select: { customerPoLineId: true, qty: true, revision: { select: { revNo: true, productionOrder: { select: { currentRevNo: true } } } } },
    });
    for (const item of prodItems) {
      if (item.revision.revNo !== item.revision.productionOrder.currentRevNo || !item.customerPoLineId) continue;
      const entry = capacityByPoLine[item.customerPoLineId];
      if (entry) entry.productionQty = (entry.productionQty ?? 0) + item.qty;
    }
  }

  // บัตรค้างเปิดอยู่ของลูกค้าในเที่ยว (เป้าหมาย "ตัดของค้างเดิม")
  const openOutstandings = await db.outstandingDelivery.findMany({
    where: { closedAt: null },
    include: { allocations: { select: { qty: true } } },
    orderBy: { openedAt: "asc" },
  });
  const outLineIds = [...new Set(openOutstandings.map((o) => o.customerPoLineId))];
  const outLines = outLineIds.length
    ? await db.customerPOLine.findMany({
        where: { id: { in: outLineIds }, customerPo: { customerId: { in: customerIds } } },
        include: { product: { select: { name: true, productionLabel: true } }, customerPo: { select: { customerId: true } } },
      })
    : [];
  const outLineById = new Map(outLines.map((l) => [l.id, l]));
  const outstandingOptions: ReconcileData["outstandingOptions"] = [];
  for (const o of openOutstandings) {
    const srcLine = outLineById.get(o.customerPoLineId);
    if (!srcLine) continue;
    const remaining = outstandingRemaining(o);
    if (remaining <= 0) continue;
    outstandingOptions.push({
      id: o.id,
      customerId: srcLine.customerPo.customerId,
      label: srcLine.product?.productionLabel ?? srcLine.product?.name ?? "—",
      size: srcLine.size,
      remaining,
      qtyOriginal: o.qtyOriginal,
      ageDays: Math.floor((Date.now() - o.openedAt.getTime()) / 86400000),
      openedAt: o.openedAt.toLocaleDateString("th-TH"),
    });
  }

  // สินค้าให้ผูก ADHOC (optional resolve)
  const products = await db.product.findMany({
    where: { parentProductId: { not: null } },
    select: { id: true, sku: true, name: true, productionLabel: true, size: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  const data: ReconcileData = {
    tripId: trip.id,
    tripNo: trip.tripNo,
    version: trip.version,
    drops: trip.drops.map((d, idx) => ({
      id: d.id,
      label: `${idx + 1}. ${customerNameById.get(d.customerId) ?? "—"}`,
      customerId: d.customerId,
      lines: d.lines.map((l) => ({
        id: l.id,
        label: l.labelSnapshot,
        size: l.size,
        sourceType: l.sourceType,
        qtyLoaded: l.qtyLoaded ?? 0,
        customerPoLineId: l.customerPoLineId,
        plannedOutstandingId: l.plannedOutstandingId,
      })),
    })),
    capacityByPoLine,
    outstandingOptions,
    products: products.map((p) => ({ id: p.id, label: `${p.productionLabel ?? p.name}${p.size ? ` (${p.size})` : ""} · ${p.sku}` })),
  };

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref={`/production/loading/${trip.id}`} />
      <h1 className="text-lg font-semibold mt-2 mb-1">กระทบยอด — {trip.tripNo}</h1>
      <p className="text-sm text-gray-500 mb-4">
        ระบุว่า &quot;ของที่ขึ้นจริง&quot; แต่ละรายการตัดจากอะไร (ออเดอร์ใหม่ / ของค้างเดิม / ของหน้างานที่ไม่มีออเดอร์) — ระบบไม่เลือกให้เอง
        ทุกชิ้นต้องมีที่มา และจะเห็นผลลัพธ์ก่อนกดยืนยันเสมอ
      </p>
      <ReconcileForm data={data} />
    </div>
  );
}
