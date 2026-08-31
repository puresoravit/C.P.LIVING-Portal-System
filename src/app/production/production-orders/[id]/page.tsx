import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { displayProdNo } from "@/lib/production-order-display";
import { ProductionOrderRevisionView } from "@/components/production/production-order-revision-view";
import { StatusBadge } from "@/components/status-badge";
import { productionOrderStatusBadge } from "@/lib/production-status-badges";
import { getProductionSettings } from "@/lib/production-settings";
import { BackLink } from "@/components/production/back-link";
import { CancelDocumentButton } from "@/components/production/cancel-document-button";
import { cancelProductionOrder } from "../actions";

// S3 CP2/CP3 — หน้ารายละเอียดใบสั่งผลิต แสดง Revision ปัจจุบัน (currentRevNo) แบบจัดกลุ่มตาม
// specHash (Production Block) ผ่าน ProductionOrderRevisionView ที่ใช้ร่วมกับหน้าดู
// Revision เก่า (CP3 — [id]/rev/[revNo]/page.tsx) + ปุ่มออก Rev ใหม่ + ประวัติ Revision
export default async function ProductionOrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const order = await db.productionOrder.findUnique({
    where: { id: params.id },
    include: {
      customerPo: { include: { customer: { select: { companyName: true, code: true } }, branch: { select: { name: true } } } },
      revisions: {
        orderBy: { revNo: "desc" },
        select: { id: true, revNo: true, confirmedAt: true, reason: true, actorId: true },
      },
    },
  });
  if (!order) notFound();

  const settings = await getProductionSettings();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  const isCancelled = !!order.cancelledAt;
  const statusBadge = productionOrderStatusBadge(!!order.productionStartedAt, settings, isCancelled);
  // CP0 — ยกเลิกแยกใบ (D3): CustomerPO ต้นทางไม่โดนแตะ ออกใบใหม่ได้ · ใบที่เริ่มผลิตแล้ว
  // ต้องมีสิทธิ์ production.cancelStarted (server enforce ซ้ำใน tx เสมอ)
  const cancelBlocked = !!order.productionStartedAt && !can(role, "production.cancelStarted");
  const cancelWarnings: string[] = [];
  if (order.productionStartedAt) {
    cancelWarnings.push("⚠ ใบนี้เริ่มผลิตไปแล้ว — ของจริงอาจอยู่บนไลน์ผลิต การยกเลิกในระบบไม่ได้ทำให้ของที่ผลิตแล้วหายไป");
    cancelWarnings.push("แจ้งหน้างานเก็บใบสั่งผลิตชุดที่พิมพ์แล้วคืนด้วย");
  }
  cancelWarnings.push("ออเดอร์ลูกค้าต้นทางยังใช้งานได้ตามปกติ และออกใบสั่งผลิตใหม่ได้ — ยกเลิกเฉพาะใบนี้เท่านั้น");
  cancelWarnings.push("ประวัติ/Revision ของใบนี้ยังเปิดดูได้ — การยกเลิกถอนกลับไม่ได้");
  const cancelledBy = order.cancelledById
    ? await db.user.findUnique({ where: { id: order.cancelledById }, select: { displayName: true, username: true } })
    : null;

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

  const actorIds = [...new Set(order.revisions.map((r) => r.actorId))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, username: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.displayName || a.username]));

  // S4 UAT round 4 — Owner ยืนยันกฎล่าสุด: ลูกค้าแก้/สั่งเพิ่มหลังออกใบสั่งผลิตแล้ว "ไม่บังคับ
  // พิมพ์ใหม่" (หน้างานจริงใช้โทรบอก + แก้กระดาษเดิมด้วยปากกา) — สิ่งที่ระบบต้องทำคือเตือน
  // ให้เห็นว่า P.O. ต้นทางถูกแก้หลัง Rev ปัจจุบันถูกออก ตรวจจาก CustomerPORevision ล่าสุด
  // (แม่นกว่า updatedAt เพราะ CustomerPORevision เกิดเฉพาะตอนแก้เนื้อหา P.O. จริงเท่านั้น)
  const latestPoRevision = await db.customerPORevision.findFirst({
    where: { customerPoId: order.customerPoId },
    orderBy: { revNo: "desc" },
    select: { revNo: true, createdAt: true },
  });
  const poEditedAfterCurrentRev =
    !!currentRevision && !!latestPoRevision && latestPoRevision.createdAt > currentRevision.confirmedAt;

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref={`/production/orders/${order.customerPoId}`} />
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">{displayProdNo(order.prodNo, order.currentRevNo)}</h1>
        <StatusBadge {...statusBadge} />
      </div>
      <p className="text-sm text-gray-500 mb-1">
        {order.customerPo.customer.companyName} ({order.customerPo.customer.code})
        {order.customerPo.branch && ` — ${order.customerPo.branch.name}`}
        {" · "}
        <a href={`/production/orders/${order.customerPoId}`} className="text-blue-600 hover:underline">
          ดูออเดอร์ต้นทาง
        </a>
      </p>

      {/* S4 UAT round 4 — ปุ่ม action ใช้ภาษาหน้างาน ไม่ใช่ศัพท์เทคนิค: "แก้ไขใบสั่งผลิต"
          คือกลไก Production Revision เดิมเป๊ะ (แค่เปลี่ยน label) ส่วน "+ ลูกค้าสั่งเพิ่ม /
          แก้ P.O." พาเข้าหน้าแก้ CustomerPO ต้นทางตรงๆ ไม่ต้องย้อนไปหาเองในหน้ารายการ —
          คำว่า Revision เหลือไว้เฉพาะ section ประวัติด้านล่าง */}
      {isCancelled && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2 mb-4">
          ✕ ใบสั่งผลิตนี้ถูกยกเลิกเมื่อ {order.cancelledAt!.toLocaleString("th-TH")}
          {cancelledBy && ` โดย ${cancelledBy.displayName || cancelledBy.username}`}
          {order.cancelReason && ` — เหตุผล: ${order.cancelReason}`}
          <span className="block text-xs mt-0.5 text-red-600">
            ประวัติ/Revision ยังเปิดดูได้ — แก้ไข/พิมพ์เพื่อสั่งงาน/เริ่มผลิตต่อไม่ได้ ใบที่พิมพ์ไปแล้วถือเป็นโมฆะ
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <a
          href={`/production/production-orders/${order.id}/print`}
          className="inline-block text-xs px-2 py-0.5 rounded-full bg-cp-navy text-white hover:bg-cp-navy-light"
        >
          {isCancelled ? "ดูเอกสาร (ยกเลิกแล้ว)" : "พิมพ์ใบสั่งผลิต"}
        </a>
        {!isCancelled && (
          <>
            <a
              href={`/production/production-orders/${order.id}/revise`}
              className="inline-block text-xs px-2 py-0.5 rounded-full border border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              แก้ไขใบสั่งผลิต
            </a>
            <a
              href={`/production/orders/${order.customerPoId}/edit`}
              className="inline-block text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-700 hover:bg-green-50"
            >
              + ลูกค้าสั่งเพิ่ม / แก้ออเดอร์
            </a>
            {can(role, "productionOrder.cancel") && (
              <CancelDocumentButton
                buttonLabel="ยกเลิกใบสั่งผลิต"
                modalTitle={order.productionStartedAt ? "ยกเลิกใบสั่งผลิตที่เริ่มผลิตแล้ว?" : "ยกเลิกใบสั่งผลิตนี้?"}
                warningLines={cancelWarnings}
                danger={!!order.productionStartedAt}
                blockedMessage={cancelBlocked ? "ใบสั่งผลิตนี้เริ่มผลิตไปแล้ว — การยกเลิกต้องให้ผู้ดูแลระบบเป็นผู้ทำ" : undefined}
                action={cancelProductionOrder.bind(null, order.id)}
              />
            )}
          </>
        )}
      </div>

      {!isCancelled && poEditedAfterCurrentRev && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 mb-4">
          ⚠ ออเดอร์ต้นทางมีการแก้ไขหลังออกใบสั่งผลิตนี้ (แก้ล่าสุด{" "}
          {latestPoRevision!.createdAt.toLocaleString("th-TH")}) — กรุณาตรวจสอบว่ารายการผลิตยังตรงกับที่ลูกค้าสั่งจริง
          ถ้าต้องแก้ใบสั่งผลิต กด &quot;แก้ไขใบสั่งผลิต&quot; ได้ (ไม่บังคับต้องพิมพ์ใหม่ —{" "}
          <a href={`/production/orders/${order.customerPoId}`} className="underline">
            ดูออเดอร์ต้นทาง
          </a>
          )
        </div>
      )}

      <h2 className="text-sm font-medium text-gray-700 mb-2">รายการผลิต ({currentRevision?.items.length ?? 0})</h2>
      {currentRevision && <ProductionOrderRevisionView items={currentRevision.items} customerPoId={order.customerPoId} />}

      {order.revisions.length > 1 && (
        <>
          <h2 className="text-sm font-medium text-gray-700 mt-6 mb-2">ประวัติ Revision ({order.revisions.length})</h2>
          <div className="space-y-2">
            {order.revisions.map((rev) => (
              <a
                key={rev.id}
                href={`/production/production-orders/${order.id}/rev/${rev.revNo}`}
                className={`flex items-center justify-between border rounded-lg p-3 text-sm ${rev.revNo === order.currentRevNo ? "bg-green-50 border-green-300" : "bg-white hover:border-cp-navy"}`}
              >
                <span>
                  <span className="font-medium">Rev.{rev.revNo}</span>
                  {rev.revNo === order.currentRevNo && <span className="ml-1.5 text-xs text-green-700">(ปัจจุบัน)</span>}
                  {rev.reason && <span className="text-gray-500 ml-2">— {rev.reason}</span>}
                </span>
                <span className="text-xs text-gray-400">
                  {actorNameById.get(rev.actorId) ?? rev.actorId} · {rev.confirmedAt.toLocaleString("th-TH")}
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
