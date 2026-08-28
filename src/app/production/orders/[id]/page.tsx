import { db } from "@/lib/db";
import { notFound } from "next/navigation";

const DATE_MODE_LABEL: Record<string, string> = {
  UNSET: "ยังไม่กำหนด",
  ESTIMATE: "ประมาณ",
  EXACT: "ระบุชัด",
};

const CHANGE_TYPE_LABEL: Record<string, string> = {
  ADD_LINE: "เพิ่มรายการ",
  QTY_CHANGE: "แก้จำนวน",
  CANCEL_LINE: "ยกเลิกรายการ",
  RESOLVE_PRODUCT: "ผูกสินค้าจากระบบ",
  ORDER_LEVEL: "แก้ข้อมูลหัว P.O.",
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
    },
  });
  if (!po) notFound();

  // actorId ยังไม่ผูก @relation กับ User (ดู schema.prisma) — ดึงชื่อแยกเพื่อไม่ต้อง
  // แก้ schema/migration ใน Checkpoint นี้
  const actorIds = [...new Set(po.revisions.map((r) => r.actorId))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, username: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.displayName || a.username]));

  // before/after เป็น Json snapshot เก็บ productId ดิบ — ดึงชื่อสินค้ามาแสดงแทน id ในประวัติ
  const snapshotProductIds = new Set<string>();
  for (const rev of po.revisions) {
    for (const c of rev.changes) {
      for (const snap of [c.before, c.after]) {
        const pid = (snap as Record<string, unknown> | null)?.productId;
        if (typeof pid === "string") snapshotProductIds.add(pid);
      }
    }
  }
  const snapshotProducts = snapshotProductIds.size
    ? await db.product.findMany({ where: { id: { in: [...snapshotProductIds] } }, select: { id: true, name: true, productionLabel: true } })
    : [];
  const productLabelById = new Map(snapshotProducts.map((p) => [p.id, p.productionLabel ?? p.name]));

  function describeChange(c: NonNullable<typeof po>["revisions"][number]["changes"][number]): string {
    const before = (c.before ?? {}) as Record<string, any>;
    const after = (c.after ?? {}) as Record<string, any>;
    const labelOf = (snap: Record<string, any>) =>
      snap.lineKind === "CATALOG" ? productLabelById.get(snap.productId) ?? "(สินค้าที่ถูกลบ)" : snap.rawProductText || "—";
    switch (c.changeType) {
      case "ADD_LINE":
        return `+ เพิ่ม "${labelOf(after)}"${after.size ? ` ไซส์ ${after.size}` : ""} จำนวน ${after.qty}`;
      case "CANCEL_LINE":
        return `- ยกเลิก "${labelOf(before)}"${before.size ? ` ไซส์ ${before.size}` : ""} จำนวน ${before.qty}`;
      case "RESOLVE_PRODUCT":
        return `ผูกกับสินค้า "${labelOf(after)}" (เดิมพิมพ์เอง: "${before.rawProductText ?? "—"}")`;
      case "QTY_CHANGE":
        return `"${labelOf(before)}" จำนวน ${before.qty} → ${after.qty}`;
      case "ORDER_LEVEL":
        return "แก้ข้อมูลหัว P.O. (ลูกค้า/สาขา/วันที่/ด่วน)";
      default:
        return CHANGE_TYPE_LABEL[c.changeType] ?? c.changeType;
    }
  }

  return (
    <div className="max-w-2xl">
      <a href="/production/orders" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการออเดอร์ลูกค้า
      </a>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">
          {po.customer.companyName}
          {po.urgency && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 align-middle">ด่วน</span>}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{po.status}</span>
          <a
            href={`/production/orders/${po.id}/edit`}
            className="text-xs px-2 py-0.5 rounded-full border border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            แก้ไข
          </a>
        </div>
      </div>

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
