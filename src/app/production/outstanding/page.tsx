import { db } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import type { StatusBadgeConfig } from "@/components/status-badge";

// CP4 — หน้า "ของค้างส่ง": รายการบัตรค้างพร้อมยอด เดิมค้าง/ขึ้นแล้ว/ตัดแล้ว/เหลือ (derive จาก
// ledger เสมอ) + filter ลูกค้า/สถานะ/อายุขั้นต่ำ — ภาษาหน้างานล้วน ไม่มีคำว่า allocation/ledger

const CARD_BADGE: StatusBadgeConfig = {
  OPEN: { label: "เหลือค้าง", className: "bg-amber-100 text-amber-700" },
  OPEN_OVER: { label: "เกินยอดออเดอร์ — รอตัด", className: "bg-red-100 text-red-700" },
  CLOSED_DELIVERED: { label: "ปิดแล้ว (ส่งครบ)", className: "bg-green-100 text-green-700" },
  CLOSED_CUT: { label: "ปิดแล้ว (มีตัดยอด)", className: "bg-gray-200 text-gray-600" },
};

export default async function OutstandingListPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await props.searchParams;
  const customerId = sp.customerId || undefined;
  const status = sp.status || "open"; // open | closed | all
  const minAge = sp.minAge ? Number(sp.minAge) : undefined;

  const [cards, customers] = await Promise.all([
    db.outstandingDelivery.findMany({
      where: status === "open" ? { closedAt: null } : status === "closed" ? { closedAt: { not: null } } : {},
      include: { allocations: { select: { kind: true, qty: true } } },
      orderBy: { openedAt: "asc" },
      take: 300,
    }),
    db.customer.findMany({ where: { active: true }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
  ]);

  const lineIds = [...new Set(cards.map((c) => c.customerPoLineId))];
  const lines = lineIds.length
    ? await db.customerPOLine.findMany({
        where: { id: { in: lineIds } },
        include: {
          product: { select: { name: true, productionLabel: true, sku: true } },
          customerPo: {
            select: { id: true, customerId: true, branchId: true, createdAt: true, orderSeqNo: true, cancelledAt: true, customer: { select: { companyName: true } }, branch: { select: { name: true } } },
          },
        },
      })
    : [];
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const rows = cards
    .map((c) => {
      const line = lineById.get(c.customerPoLineId);
      const delivered = c.allocations.filter((a) => a.kind === "OUTSTANDING").reduce((s, a) => s + a.qty, 0);
      const cut = c.allocations.filter((a) => a.kind === "CUT").reduce((s, a) => s + a.qty, 0);
      const remaining = c.qtyOriginal - delivered - cut;
      const ageDays = Math.floor((Date.now() - c.openedAt.getTime()) / 86400000);
      // "เกินยอดออเดอร์": ออเดอร์ถูกลด/ยกเลิกจน demand ปัจจุบันน้อยกว่ายอดค้างเปิดอยู่ —
      // บัตรไม่ลดเอง (ห้าม bypass สิทธิ์ตัด) แต่ป้ายแดงชี้ให้แอดมินมาจัดการ
      const overDemand =
        !c.closedAt && line ? remaining > Math.max(0, line.qtyCurrent) || !!line.customerPo.cancelledAt : false;
      const badgeKey = c.closedAt ? (cut > 0 ? "CLOSED_CUT" : "CLOSED_DELIVERED") : overDemand ? "OPEN_OVER" : "OPEN";
      return { c, line, delivered, cut, remaining, ageDays, badgeKey };
    })
    .filter((r) => !customerId || r.line?.customerPo.customerId === customerId)
    .filter((r) => minAge == null || r.ageDays >= minAge);

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">ของค้างส่ง</h1>
      <p className="text-sm text-gray-500 mb-4">ของที่ลูกค้ายังไม่ได้รับครบ — อายุนับจากวันกระทบยอดที่พบว่าค้างจริง ไม่รีเซ็ตจากการทยอยส่ง</p>

      <form className="bg-white border rounded-lg p-3 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ลูกค้า</label>
          <select name="customerId" defaultValue={customerId ?? ""} className="w-full border rounded px-2 py-1.5">
            <option value="">ทั้งหมด</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.companyName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">สถานะ</label>
          <select name="status" defaultValue={status} className="w-full border rounded px-2 py-1.5">
            <option value="open">ยังค้างอยู่</option>
            <option value="closed">ปิดแล้ว</option>
            <option value="all">ทั้งหมด</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">อายุค้างตั้งแต่ (วัน)</label>
          <input type="number" min="0" name="minAge" defaultValue={sp.minAge ?? ""} className="w-full border rounded px-2 py-1.5" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="bg-cp-navy hover:bg-cp-navy-light text-white text-sm font-medium rounded-lg px-4 py-2 w-full">กรอง</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500 text-center">ไม่มีของค้างตามเงื่อนไข</div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ c, line, delivered, cut, remaining, ageDays, badgeKey }) => (
            <a key={c.id} href={`/production/outstanding/${c.id}`} className="block bg-white border rounded-lg p-3 hover:border-cp-navy">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium min-w-0">
                  {line?.product?.productionLabel ?? line?.product?.name ?? "—"}
                  {line?.size && <span className="text-gray-500 font-normal"> (ไซส์ {line.size})</span>}
                </span>
                <StatusBadge status={badgeKey} config={CARD_BADGE} />
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {line?.customerPo.customer.companyName ?? "—"}
                {line?.customerPo.branch && ` — ${line.customerPo.branch.name}`}
                {" · ออเดอร์ "}{line?.customerPo.createdAt.toLocaleDateString("th-TH")}
                {line?.customerPo.orderSeqNo != null && ` ครั้งที่ ${line.customerPo.orderSeqNo}`}
                {line?.customerPo.cancelledAt && <span className="text-red-600"> (ออเดอร์ถูกยกเลิก)</span>}
              </div>
              <div className="text-xs mt-1 flex flex-wrap gap-x-3">
                <span>ค้างตั้งแต่ {c.openedAt.toLocaleDateString("th-TH")} ({ageDays} วัน)</span>
                <span>เดิมค้าง <b>{c.qtyOriginal}</b></span>
                <span>ขึ้นแล้ว <b className="text-green-700">{delivered}</b></span>
                {cut > 0 && <span>ตัดยอดแล้ว <b className="text-gray-600">{cut}</b></span>}
                <span>เหลือ <b className={remaining > 0 ? "text-amber-700" : ""}>{remaining}</b></span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
