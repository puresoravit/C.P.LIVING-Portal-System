import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { displayProdNo } from "@/lib/production-order-display";
import { StatusBadge } from "@/components/status-badge";
import { customerPoStatusBadge, productionOrderStatusBadge } from "@/lib/production-status-badges";
import { getProductionSettings } from "@/lib/production-settings";
import { BackLink } from "@/components/production/back-link";
import { CancelDocumentButton } from "@/components/production/cancel-document-button";
import { collectSnapshotProductIds, describeCustomerPoChange } from "@/lib/customer-po-revision-describe";
import { cancelCustomerPO } from "../actions";

const DATE_MODE_LABEL: Record<string, string> = {
  UNSET: "ยังไม่กำหนด",
  ESTIMATE: "ประมาณ",
  EXACT: "ระบุชัด",
};

// S2 Checkpoint 2 — เพิ่มลิงก์แก้ไข + แสดงประวัติการแก้ไข (Revision History)
export default async function CustomerPODetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const po = await db.customerPO.findUnique({
    where: { id: params.id },
    include: {
      customer: { select: { companyName: true, code: true } },
      branch: { select: { name: true } },
      lines: {
        where: { active: true },
        include: { product: { select: { name: true, sku: true, productionLabel: true } } },
        orderBy: { id: "asc" },
      },
      revisions: {
        include: { changes: true },
        orderBy: { revNo: "desc" },
      },
      productionOrders: {
        orderBy: { createdAt: "desc" },
        select: { id: true, prodNo: true, currentRevNo: true, status: true, createdAt: true, productionStartedAt: true, cancelledAt: true },
      },
    },
  });
  if (!po) notFound();

  const productionSettings = await getProductionSettings();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  const isCancelled = !!po.cancelledAt;
  // CP0 — บริบทของ modal ยกเลิก: cascade ไปใบสั่งผลิตที่ยัง active ทุกใบ (D3) — ถ้ามีใบที่
  // เริ่มผลิตแล้วต้องใช้สิทธิ์ production.cancelStarted (server enforce ซ้ำอีกชั้นใน tx เสมอ)
  const activePOsForCancel = po.productionOrders.filter((o) => !o.cancelledAt);
  const startedPOs = activePOsForCancel.filter((o) => o.productionStartedAt);
  const cancelBlocked = startedPOs.length > 0 && !can(role, "production.cancelStarted");
  const cancelWarnings: string[] = [];
  if (startedPOs.length > 0) {
    cancelWarnings.push(
      `⚠ ใบสั่งผลิต ${startedPOs.map((o) => o.prodNo).join(", ")} เริ่มผลิตไปแล้ว — ของจริงอาจอยู่บนไลน์ผลิต การยกเลิกในระบบไม่ได้ทำให้ของที่ผลิตแล้วหายไป`
    );
    cancelWarnings.push("แจ้งหน้างานเก็บใบสั่งผลิตชุดที่พิมพ์แล้วคืนด้วย");
  }
  if (activePOsForCancel.length > 0) {
    cancelWarnings.push(`ใบสั่งผลิตที่จะถูกยกเลิกพร้อมกัน: ${activePOsForCancel.map((o) => o.prodNo).join(", ")}`);
  }
  cancelWarnings.push("ประวัติ/Revision ทั้งหมดยังเปิดดูได้ — การยกเลิกถอนกลับไม่ได้ ถ้าลูกค้ากลับมาสั่งใหม่ให้สร้างออเดอร์ใหม่");
  const cancelledBy = po.cancelledById
    ? await db.user.findUnique({ where: { id: po.cancelledById }, select: { displayName: true, username: true } })
    : null;

  const hasEligibleLineForProduction = po.lines.some((l) => l.lineKind === "CATALOG");

  // actorId ยังไม่ผูก @relation กับ User (ดู schema.prisma) — ดึงชื่อแยกเพื่อไม่ต้อง
  // แก้ schema/migration ใน Checkpoint นี้
  const actorIds = [...new Set(po.revisions.map((r) => r.actorId))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, username: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.displayName || a.username]));

  // before/after เป็น Json snapshot เก็บ productId ดิบ — ดึงชื่อสินค้ามาแสดงแทน id ในประวัติ
  const snapshotProductIds = collectSnapshotProductIds(po.revisions.flatMap((r) => r.changes));
  const snapshotProducts = snapshotProductIds.size
    ? await db.product.findMany({ where: { id: { in: [...snapshotProductIds] } }, select: { id: true, name: true, productionLabel: true } })
    : [];
  const productLabelById = new Map(snapshotProducts.map((p) => [p.id, p.productionLabel ?? p.name]));
  const describeChange = (c: NonNullable<typeof po>["revisions"][number]["changes"][number]) => describeCustomerPoChange(c, productLabelById);

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref="/production/orders" />
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">
          {po.customer.companyName}
          {po.urgency && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 align-middle">ด่วน</span>}
        </h1>
        <div className="flex items-center gap-2">
          <StatusBadge {...customerPoStatusBadge(po.productionOrders.length > 0, isCancelled)} />
          {!isCancelled && (
            <a
              href={`/production/orders/${po.id}/edit`}
              className="text-xs px-2 py-0.5 rounded-full border border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              แก้ไข
            </a>
          )}
          {!isCancelled && can(role, "customerPo.cancel") && (
            <CancelDocumentButton
              buttonLabel="ยกเลิกออเดอร์"
              modalTitle={startedPOs.length > 0 ? "ยกเลิกออเดอร์ที่เริ่มผลิตแล้ว?" : "ยกเลิกออเดอร์นี้?"}
              warningLines={cancelWarnings}
              danger={startedPOs.length > 0}
              blockedMessage={cancelBlocked ? "มีใบสั่งผลิตที่เริ่มผลิตไปแล้ว — การยกเลิกออเดอร์นี้ต้องให้ผู้ดูแลระบบเป็นผู้ทำ" : undefined}
              version={po.version}
              action={cancelCustomerPO.bind(null, po.id)}
            />
          )}
        </div>
      </div>

      {isCancelled && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2 mb-4">
          ✕ ออเดอร์นี้ถูกยกเลิกเมื่อ {po.cancelledAt!.toLocaleString("th-TH")}
          {cancelledBy && ` โดย ${cancelledBy.displayName || cancelledBy.username}`}
          {po.cancelReason && ` — เหตุผล: ${po.cancelReason}`}
          <span className="block text-xs mt-0.5 text-red-600">
            ประวัติทั้งหมดยังเปิดดูได้ — แก้ไข/ออกใบสั่งผลิตต่อไม่ได้ ถ้าลูกค้ากลับมาสั่งใหม่ให้สร้างออเดอร์ใหม่
          </span>
        </div>
      )}

      {hasEligibleLineForProduction && !isCancelled && (
        <a
          href={`/production/production-orders/new?customerPoId=${po.id}`}
          className="block text-center bg-cp-navy hover:bg-cp-navy-light text-white text-sm font-medium rounded-lg px-4 py-2.5 mb-4"
        >
          + สร้างใบสั่งผลิต
        </a>
      )}

      <div className="bg-white border rounded-lg p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">สาขา</div>
          <div>{po.branch?.name ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">สั่งครั้งที่</div>
          <div>{po.orderSeqNo ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">วันที่ต้องการ</div>
          <div>
            {DATE_MODE_LABEL[po.dateMode] ?? po.dateMode}
            {po.requestedDate && ` (${po.requestedDate.toLocaleDateString("th-TH")})`}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">สร้างเมื่อ</div>
          <div>{po.createdAt.toLocaleDateString("th-TH")}</div>
        </div>
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">รายการ ({po.lines.length})</h2>
      <div className="space-y-2">
        {po.lines.map((line) => (
          <div key={line.id} className="bg-white border rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">
                  {/* Architecture (2026-08-28) — identity กลางคือ productId (Product ตัวเดียว
                      ใช้ร่วมกับ Billing) ชื่อที่แสดงในหน้าจอ Production ใช้ productionLabel
                      ก่อนเสมอ fallback เป็น name เมื่อยังไม่มีค่า (ยังไม่มีข้อมูลจริงตอนนี้ —
                      รอเจ้าของส่งมา) — ไม่ใช่ text-mapping ข้ามระบบ แค่ override การแสดงผล
                      บน Product เดียวกัน */}
                  {line.lineKind === "CATALOG" ? (line.product?.productionLabel ?? line.product?.name ?? "—") : line.rawProductText}
                  {line.lineKind === "UNRESOLVED" && (
                    <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">ยังไม่มีในระบบ</span>
                  )}
                </div>
                {line.product?.sku && <div className="text-xs text-gray-400 font-mono">{line.product.sku}</div>}
                {line.size && <div className="text-xs text-gray-500 mt-0.5">ไซส์ {line.size}</div>}
                {/* วันที่เฉพาะรายการ = override เฉพาะบรรทัดด่วน (ปกติ inherit จาก P.O. ด้านบน
                    อยู่แล้ว ไม่ต้องแสดงซ้ำ) */}
                {line.requiredDate && (
                  <div className="text-xs text-red-600 mt-0.5">ต้องการวันที่ {line.requiredDate.toLocaleDateString("th-TH")} (เฉพาะรายการนี้)</div>
                )}
                {line.note && <div className="text-xs text-gray-500 mt-0.5">หมายเหตุ: {line.note}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-semibold">{line.qtyCurrent}</div>
                {line.urgency && <div className="text-xs text-red-600">ด่วน</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {po.productionOrders.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-gray-700 mt-6 mb-2">ใบสั่งผลิตที่ออกจากออเดอร์นี้ ({po.productionOrders.length})</h2>
          <div className="space-y-2">
            {po.productionOrders.map((order) => (
              <a
                key={order.id}
                href={`/production/production-orders/${order.id}`}
                className="flex items-center justify-between bg-white border rounded-lg p-3 hover:border-cp-navy text-sm"
              >
                <span className="font-medium">{displayProdNo(order.prodNo, order.currentRevNo)}</span>
                <StatusBadge {...productionOrderStatusBadge(!!order.productionStartedAt, productionSettings, !!order.cancelledAt)} />
              </a>
            ))}
          </div>
        </>
      )}

      <h2 className="text-sm font-medium text-gray-700 mt-6 mb-2">ประวัติการแก้ไข (Revision History)</h2>
      <div className="space-y-3">
        {po.revisions.map((rev) => (
          <div key={rev.id} className="bg-white border rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 text-xs text-gray-500 mb-1.5">
              <span className="font-medium text-gray-700">Rev.{rev.revNo}</span>
              <span>
                {actorNameById.get(rev.actorId) ?? rev.actorId} · {rev.createdAt.toLocaleString("th-TH")}
              </span>
            </div>
            {rev.reason && <div className="text-sm mb-1.5">เหตุผล: {rev.reason}</div>}
            {rev.changes.length > 0 ? (
              <ul className="text-sm text-gray-700 space-y-0.5 list-disc list-inside">
                {rev.changes.map((c) => (
                  <li key={c.id}>{describeChange(c)}</li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-gray-400">ไม่มีการเปลี่ยนแปลง</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
