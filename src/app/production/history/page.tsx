import { db } from "@/lib/db";
import { displayProdNo } from "@/lib/production-order-display";
import { describeCustomerPoChange, collectSnapshotProductIds } from "@/lib/customer-po-revision-describe";
import type { AuditLog } from "@prisma/client";

// S5 — หน้า "ประวัติ" ใช้งานจริง: อ่านจาก AuditLog (module CustomerPO/ProductionOrder)
// ที่มีอยู่แล้วตั้งแต่ S1-S4 ล้วนๆ ไม่สร้างตาราง/แหล่งข้อมูลใหม่ซ้ำ — รายละเอียดระดับบรรทัด
// ของ CustomerPO (เพิ่ม/ลด/แก้ไซส์-จำนวน/ผูกสินค้า) ดึงจาก CustomerPORevisionChange ผ่าน
// (customerPoId, revNo) ที่ AuditLog.newValue เก็บไว้อยู่แล้ว (ไม่ใช่ field ใหม่)
//
// Event type เป็นการ "จัดกลุ่ม/แปลภาษา" newValue.event ที่มีอยู่แล้วให้เป็นคำที่พนักงานอ่าน
// เข้าใจทันที (ไม่ expose module/action ดิบ) — ยังไม่พอสำหรับ filter ระดับ DB (Json path
// query เปราะกับ Prisma+Postgres) จึงกรอง eventType ใน memory หลัง fetch ช่วงวันที่/ลูกค้า
// จาก DB ก่อนแล้ว (ปริมาณข้อมูล P1 ยังน้อย เพียงพอสำหรับแนวทางนี้ไม่ต้องทำ pagination ซับซ้อน)

type EventKey = "PO_CREATE" | "PO_UPDATE" | "PO_CANCEL" | "PROD_CREATE" | "PROD_REVISE" | "PROD_START" | "PROD_PRINT" | "PROD_CANCEL" | "PROD_COMPLETED" | "TRIP_CREATE" | "TRIP_LOADED" | "TRIP_RECONCILE" | "TRIP_CANCEL" | "OUT_OPEN" | "OUT_CUT" | "OUT_CLOSE";

const EVENT_LABELS: Record<EventKey, string> = {
  PO_CREATE: "รับออเดอร์ลูกค้า",
  PO_UPDATE: "แก้ไขออเดอร์ลูกค้า",
  PO_CANCEL: "ยกเลิกออเดอร์ลูกค้า",
  PROD_CREATE: "ออกใบสั่งผลิต",
  PROD_REVISE: "แก้ไขใบสั่งผลิต",
  PROD_START: "เริ่มผลิต",
  PROD_PRINT: "พิมพ์ใบสั่งผลิต",
  PROD_CANCEL: "ยกเลิกใบสั่งผลิต",
  PROD_COMPLETED: "ผลิตเสร็จ (ฝ่ายขึ้นของยืนยัน)",
  TRIP_CREATE: "สร้างเที่ยวรถ",
  TRIP_LOADED: "ยืนยันขึ้นของ",
  TRIP_RECONCILE: "กระทบยอดเที่ยวรถ",
  TRIP_CANCEL: "ยกเลิกเที่ยวรถ",
  OUT_OPEN: "เกิดของค้างส่ง",
  OUT_CUT: "ตัดยอดของค้าง",
  OUT_CLOSE: "ของค้างส่งครบ",
};

const EVENT_DOT: Record<EventKey, string> = {
  PO_CREATE: "bg-blue-500",
  PO_UPDATE: "bg-amber-500",
  PO_CANCEL: "bg-red-600",
  PROD_CREATE: "bg-cp-navy",
  PROD_REVISE: "bg-amber-500",
  PROD_START: "bg-green-600",
  PROD_PRINT: "bg-gray-500",
  PROD_CANCEL: "bg-red-600",
  PROD_COMPLETED: "bg-emerald-500",
  TRIP_CREATE: "bg-violet-500",
  TRIP_LOADED: "bg-blue-600",
  TRIP_RECONCILE: "bg-emerald-600",
  TRIP_CANCEL: "bg-red-600",
  OUT_OPEN: "bg-amber-600",
  OUT_CUT: "bg-red-600",
  OUT_CLOSE: "bg-green-600",
};

function classify(row: Pick<AuditLog, "module" | "action" | "newValue">): EventKey | null {
  if (row.module === "CustomerPO") {
    if (row.action === "CANCEL") return "PO_CANCEL";
    return row.action === "CREATE" ? "PO_CREATE" : "PO_UPDATE";
  }
  if (row.module === "ProductionOrder") {
    if (row.action === "CANCEL") return "PROD_CANCEL";
    if (row.action === "CREATE") return "PROD_CREATE";
    const nv = row.newValue as Record<string, unknown> | null;
    if (nv?.event === "START_PRODUCTION") return "PROD_START";
    if (nv?.event === "PRINT_REVISION") return "PROD_PRINT";
    if (nv?.event === "PRODUCTION_COMPLETED") return "PROD_COMPLETED";
    return "PROD_REVISE";
  }
  // CP4 — เหตุการณ์เที่ยวรถ/ของค้าง (เฉพาะจังหวะสำคัญ — ADD_DROP/ADD_LINE ฯลฯ ละเอียดเกิน
  // สำหรับ timeline รวม จึง return null ให้ถูกกรองออก แต่ยังอยู่ครบใน AuditLog เสมอ)
  if (row.module === "LoadingTrip") {
    const nv = row.newValue as Record<string, unknown> | null;
    if (nv?.event === "CREATE") return "TRIP_CREATE";
    if (nv?.event === "CONFIRM_LOADED") return "TRIP_LOADED";
    if (nv?.event === "RECONCILE") return "TRIP_RECONCILE";
    if (nv?.event === "CANCEL") return "TRIP_CANCEL";
    return null;
  }
  if (row.module === "Outstanding") {
    const nv = row.newValue as Record<string, unknown> | null;
    if (nv?.event === "OPEN_OUTSTANDING") return "OUT_OPEN";
    if (nv?.event === "CUT_OUTSTANDING") return "OUT_CUT";
    if (nv?.event === "CLOSE_OUTSTANDING") return "OUT_CLOSE";
    return null;
  }
  return null;
}

export default async function ProductionHistoryPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await props.searchParams;
  const customerId = sp.customerId || undefined;
  const eventType = (sp.eventType as EventKey | undefined) || undefined;
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : undefined;
  const to = sp.to ? new Date(`${sp.to}T23:59:59.999`) : undefined;

  const [rows, customers] = await Promise.all([
    db.auditLog.findMany({
      where: {
        module: { in: ["CustomerPO", "ProductionOrder", "LoadingTrip", "Outstanding"] },
        ...(customerId ? { customerId } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.customer.findMany({ where: { active: true }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
  ]);

  const classified = rows.filter((r) => classify(r) !== null); // เหตุการณ์ย่อยของเที่ยว (ADD_DROP ฯลฯ) ไม่ขึ้น timeline รวม
  const filtered = eventType ? classified.filter((r) => classify(r) === eventType) : classified;
  const display = filtered.slice(0, 100);

  const actorIds = [...new Set(display.map((r) => r.userId))];
  const custIds = [...new Set(display.map((r) => r.customerId).filter((v): v is string => !!v))];
  const branchIds = [...new Set(display.map((r) => r.branchId).filter((v): v is string => !!v))];
  const poIds = [...new Set(display.filter((r) => r.module === "CustomerPO").map((r) => r.recordId))];
  const prodIds = [...new Set(display.filter((r) => r.module === "ProductionOrder").map((r) => r.recordId))];

  const [actors, custs, branches, prods] = await Promise.all([
    actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, username: true } }) : Promise.resolve([]),
    custIds.length ? db.customer.findMany({ where: { id: { in: custIds } }, select: { id: true, companyName: true } }) : Promise.resolve([]),
    branchIds.length ? db.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    prodIds.length ? db.productionOrder.findMany({ where: { id: { in: prodIds } }, select: { id: true, prodNo: true, currentRevNo: true } }) : Promise.resolve([]),
  ]);
  void poIds; // CustomerPO เอง label ไม่ต้อง join เพิ่ม (แสดงชื่อลูกค้า/สาขาก็พอสื่อความหมาย)

  // CP4 — เที่ยวรถ/บัตรค้างที่ปรากฏใน timeline
  const tripIds = [...new Set(display.filter((r) => r.module === "LoadingTrip").map((r) => r.recordId))];
  const trips = tripIds.length
    ? await db.loadingTrip.findMany({ where: { id: { in: tripIds } }, select: { id: true, tripNo: true } })
    : [];
  const tripById = new Map(trips.map((t) => [t.id, t]));

  const actorNameById = new Map(actors.map((a) => [a.id, a.displayName || a.username]));
  const custNameById = new Map(custs.map((c) => [c.id, c.companyName]));
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const prodById = new Map(prods.map((p) => [p.id, p]));

  // CustomerPO UPDATE — ดึงรายละเอียดระดับบรรทัดจาก CustomerPORevisionChange ผ่าน
  // (customerPoId, revNo) ที่ผูกกับ @@unique เดิม ไม่ต้องเพิ่ม FK ใหม่
  const poUpdateRows = display.filter((r) => classify(r) === "PO_UPDATE");
  const revKeys = poUpdateRows
    .map((r) => ({ customerPoId: r.recordId, revNo: (r.newValue as Record<string, unknown> | null)?.revNo }))
    .filter((k): k is { customerPoId: string; revNo: number } => typeof k.revNo === "number");
  const revisions = revKeys.length
    ? await db.customerPORevision.findMany({
        where: { OR: revKeys.map((k) => ({ customerPoId: k.customerPoId, revNo: k.revNo })) },
        include: { changes: true },
      })
    : [];
  const revisionByKey = new Map(revisions.map((r) => [`${r.customerPoId}:${r.revNo}`, r]));
  const productIds = collectSnapshotProductIds(revisions.flatMap((r) => r.changes));
  const products = productIds.size
    ? await db.product.findMany({ where: { id: { in: [...productIds] } }, select: { id: true, name: true, productionLabel: true } })
    : [];
  const productLabelById = new Map(products.map((p) => [p.id, p.productionLabel ?? p.name]));

  function describeRow(row: (typeof display)[number]): { eventKey: EventKey; title: string; href: string; changes: string[] } {
    const key = classify(row)!;
    const nv = (row.newValue ?? {}) as Record<string, any>;
    if (key === "PO_CREATE") {
      return { eventKey: key, title: `รับออเดอร์ลูกค้าใหม่ (${nv.lineCount ?? "?"} รายการ)`, href: `/production/orders/${row.recordId}`, changes: [] };
    }
    if (key === "PO_CANCEL") {
      // AuditLog.reason เก็บเหตุผลตรงๆ (CP0) — ใบสั่งผลิตที่โดน cascade อยู่ใน newValue
      const cascaded = Array.isArray(nv.cancelledProductionOrders) && nv.cancelledProductionOrders.length > 0 ? ` (ยกเลิกใบสั่งผลิต ${nv.cancelledProductionOrders.join(", ")} ด้วย)` : "";
      return {
        eventKey: key,
        title: `ยกเลิกออเดอร์ลูกค้า${row.reason ? ` — เหตุผล: ${row.reason}` : ""}${cascaded}`,
        href: `/production/orders/${row.recordId}`,
        changes: [],
      };
    }
    if (key === "PO_UPDATE") {
      const rev = revisionByKey.get(`${row.recordId}:${nv.revNo}`);
      const changes = rev ? rev.changes.map((c) => describeCustomerPoChange(c, productLabelById)) : [];
      return {
        eventKey: key,
        title: `แก้ไขออเดอร์ลูกค้า${nv.reason ? ` — เหตุผล: ${nv.reason}` : ""}`,
        href: `/production/orders/${row.recordId}`,
        changes,
      };
    }
    const prod = prodById.get(row.recordId);
    const prodNoText = prod?.prodNo ?? "(ใบสั่งผลิตที่ถูกลบ)";
    if (key === "PROD_CREATE") {
      return { eventKey: key, title: `ออกใบสั่งผลิต ${prodNoText} (${nv.itemCount ?? "?"} รายการ)`, href: `/production/production-orders/${row.recordId}`, changes: [] };
    }
    if (key === "PROD_REVISE") {
      return {
        eventKey: key,
        title: `แก้ไขใบสั่งผลิต ${prod ? displayProdNo(prod.prodNo, nv.revNo) : prodNoText}${nv.reason ? ` — เหตุผล: ${nv.reason}` : ""}`,
        href: `/production/production-orders/${row.recordId}`,
        changes: [],
      };
    }
    if (key === "PROD_START") {
      return { eventKey: key, title: `เริ่มผลิต ${prodNoText} (สถานะ: ${nv.status ?? "-"})`, href: `/production/production-orders/${row.recordId}`, changes: [] };
    }
    if (key === "PROD_COMPLETED") {
      return { eventKey: key, title: `ผลิตเสร็จ ${prodNoText} — ฝ่ายขึ้นของยืนยันตอนเริ่มขึ้นของ`, href: `/production/production-orders/${row.recordId}`, changes: [] };
    }
    if (key === "PROD_CANCEL") {
      return {
        eventKey: key,
        title: `ยกเลิกใบสั่งผลิต ${prodNoText}${nv.viaCustomerPo ? " (ตามการยกเลิกออเดอร์)" : ""}${row.reason ? ` — เหตุผล: ${row.reason}` : ""}`,
        href: `/production/production-orders/${row.recordId}`,
        changes: [],
      };
    }
    if (key === "PROD_PRINT") {
      return {
        eventKey: key,
        title: `พิมพ์ใบสั่งผลิต ${prod ? displayProdNo(prod.prodNo, nv.revNo) : prodNoText}`,
        href: `/production/production-orders/${row.recordId}`,
        changes: [],
      };
    }
    // CP4 — เที่ยวรถ / ของค้างส่ง
    if (key === "TRIP_CREATE" || key === "TRIP_LOADED" || key === "TRIP_RECONCILE" || key === "TRIP_CANCEL") {
      const trip = tripById.get(row.recordId);
      const tripNoText = trip?.tripNo ?? nv.tripNo ?? "(เที่ยวที่ถูกลบ)";
      const extra =
        key === "TRIP_LOADED" && nv.totalLoaded != null
          ? ` (ขึ้นจริงรวม ${nv.totalLoaded} ชิ้น)`
          : key === "TRIP_CANCEL" && row.reason
            ? ` — เหตุผล: ${row.reason}`
            : "";
      return { eventKey: key, title: `${EVENT_LABELS[key]} ${tripNoText}${extra}`, href: `/production/loading/${row.recordId}`, changes: [] };
    }
    // OUT_OPEN / OUT_CUT / OUT_CLOSE
    const outExtra =
      key === "OUT_OPEN" && nv.qtyOriginal != null
        ? ` ${nv.qtyOriginal} ชิ้น`
        : key === "OUT_CUT"
          ? ` ${nv.qty ?? ""} ชิ้น${row.reason ? ` — เหตุผล: ${row.reason}` : ""}`
          : "";
    return { eventKey: key, title: `${EVENT_LABELS[key]}${outExtra}`, href: `/production/outstanding/${row.recordId}`, changes: [] };
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-1">ประวัติ</h1>
      <p className="text-sm text-gray-500 mb-4">Timeline การรับ/แก้ออเดอร์ลูกค้าและใบสั่งผลิตทั้งหมด</p>

      {/* Filter แบบ GET form — ไม่ต้องใช้ client JS, กด "กรอง" แล้วรีเฟรชด้วย query params */}
      <form className="bg-white border rounded-lg p-3 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ลูกค้า</label>
          <select name="customerId" defaultValue={customerId ?? ""} className="w-full border rounded px-2 py-1.5">
            <option value="">ทั้งหมด</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ประเภทเหตุการณ์</label>
          <select name="eventType" defaultValue={eventType ?? ""} className="w-full border rounded px-2 py-1.5">
            <option value="">ทั้งหมด</option>
            {(Object.keys(EVENT_LABELS) as EventKey[]).map((k) => (
              <option key={k} value={k}>
                {EVENT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">จากวันที่</label>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="w-full border rounded px-2 py-1.5" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ถึงวันที่</label>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="w-full border rounded px-2 py-1.5" />
        </div>
        <div className="sm:col-span-4 flex gap-2">
          <button type="submit" className="bg-cp-navy hover:bg-cp-navy-light text-white text-sm font-medium rounded-lg px-4 py-2">
            กรอง
          </button>
          {(customerId || eventType || sp.from || sp.to) && (
            <a href="/production/history" className="text-sm text-gray-500 hover:underline self-center">
              ล้างตัวกรอง
            </a>
          )}
        </div>
      </form>

      {display.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500 text-center">ไม่พบรายการตามเงื่อนไขที่กรอง</div>
      ) : (
        <div className="space-y-2">
          {display.map((row) => {
            const info = describeRow(row);
            const customerName = row.customerId ? custNameById.get(row.customerId) : null;
            const branchName = row.branchId ? branchNameById.get(row.branchId) : null;
            return (
              <a key={row.id} href={info.href} className="block bg-white border rounded-lg p-3 hover:border-cp-navy">
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${EVENT_DOT[info.eventKey]}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-500">{EVENT_LABELS[info.eventKey]}</span>
                      <span className="text-xs text-gray-400 shrink-0">{row.createdAt.toLocaleString("th-TH")}</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900 mt-0.5">{info.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {actorNameById.get(row.userId) ?? row.userId}
                      {customerName && ` · ${customerName}`}
                      {branchName && ` — ${branchName}`}
                    </div>
                    {info.changes.length > 0 && (
                      <ul className="text-xs text-gray-600 mt-1.5 space-y-0.5 list-disc list-inside">
                        {info.changes.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {filtered.length > display.length && (
        <p className="text-xs text-gray-400 text-center mt-3">แสดง {display.length} รายการล่าสุดจากทั้งหมด {filtered.length} รายการ — ปรับตัวกรองให้แคบลงเพื่อดูรายการที่ต้องการ</p>
      )}
    </div>
  );
}
