import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { StatusBadge } from "@/components/status-badge";
import { loadingTripStatusBadge } from "@/lib/production-status-badges";
import { BackLink } from "@/components/production/back-link";
import { CancelDocumentButton } from "@/components/production/cancel-document-button";
import { LoadingTripEditor, type TripEditorData } from "@/components/production/loading-trip-editor";
import { cancelLoadingTrip } from "../actions";
import { getProductionSettings } from "@/lib/production-settings";

// P2 CP1/CP2 — หน้า detail เที่ยวรถ: ช่วง DRAFT = editor เต็ม (จุดส่ง/รายการ + FRESH picker
// ที่กรองออเดอร์ยกเลิก + default กรองตรงสาขา + โชว์ยอดที่ถูกแผนไว้เที่ยวอื่น กัน accidental
// duplicate โดยไม่ hard-block) — หลัง LOADED = อ่านอย่างเดียว โชว์แผน vs ขึ้นจริง + รูปหลักฐาน
// CP6 Queue-first — ภาษาหน้างาน "รอบจัดส่ง" (เลข TRIP เป็นรอง) จุดส่งโชว์ใบผลิตต้นทาง ·
// CP7 round 2 (Owner UAT) — "บันทึกผลขึ้นของ" ย้ายออกจากหน้านี้ทั้งหมด (ลึกเกินไปในหน้ารอบ
// จัดส่ง) หน้านี้เหลือแค่เตรียมของ + พิมพ์ใบ — พิมพ์เสร็จแล้วไปบันทึกผลที่หมวด "รอบันทึกผล"
// ในหน้าคิวหลักแทน (คลิกจากตรงนั้นเข้า finalize ตรงๆ ไม่ผ่านหน้านี้อีกที)
export default async function LoadingTripDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  const trip = await db.loadingTrip.findUnique({
    where: { id: params.id },
    include: {
      drops: { orderBy: { seq: "asc" }, include: { lines: { orderBy: { id: "asc" } } } },
    },
  });
  if (!trip) notFound();

  const badge = loadingTripStatusBadge(trip);
  const isDraft = !trip.loadedAt && !trip.cancelledAt;
  const canManage = can(role, "loadingTrip.manage");
  const totalLines = trip.drops.reduce((sum, d) => sum + d.lines.length, 0);

  const [customers, branches, settings, products, plateRows] = await Promise.all([
    db.customer.findMany({
      where: { active: true },
      select: { id: true, companyName: true, branches: { where: { active: true }, select: { id: true, name: true } } },
      orderBy: { companyName: "asc" },
    }),
    db.branch.findMany({ select: { id: true, name: true } }),
    getProductionSettings(),
    db.product.findMany({
      where: { parentProductId: { not: null } },
      select: { id: true, sku: true, name: true, productionLabel: true, size: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    // CP7 round 2 — ทะเบียนรถที่เคยใช้ ให้เลือกจาก datalist แทนพิมพ์ใหม่ทุกครั้ง
    db.loadingTrip.findMany({ where: { plateNumber: { not: null } }, select: { plateNumber: true }, distinct: ["plateNumber"], take: 50 }),
  ]);
  const plateSuggestions = plateRows.map((r) => r.plateNumber!).filter(Boolean);
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const customerNameById = new Map(customers.map((c) => [c.id, c.companyName]));

  // CP6 — ใบสั่งผลิตต้นทางของแต่ละจุดส่ง (งานสต็อกไม่มี)
  const jobOrderIds = trip.drops.map((d) => d.productionOrderId).filter((v): v is string => !!v);
  const jobOrders = jobOrderIds.length
    ? await db.productionOrder.findMany({ where: { id: { in: jobOrderIds } }, select: { id: true, prodNo: true } })
    : [];
  const prodNoById = new Map(jobOrders.map((o) => [o.id, o.prodNo]));

  const actorIds = [trip.loadedById, trip.cancelledById].filter((v): v is string => !!v);
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, username: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.displayName || a.username]));

  // FRESH picker: บรรทัด CATALOG active ของลูกค้าในเที่ยวนี้ จากออเดอร์ที่ไม่ถูกยกเลิก (CP0)
  const dropCustomerIds = [...new Set(trip.drops.map((d) => d.customerId))];
  const eligibleLines = dropCustomerIds.length
    ? await db.customerPOLine.findMany({
        where: {
          active: true,
          lineKind: "CATALOG",
          customerPo: { customerId: { in: dropCustomerIds }, cancelledAt: null },
        },
        include: {
          product: { select: { sku: true, name: true, productionLabel: true } },
          customerPo: { select: { customerId: true, orderSeqNo: true, createdAt: true, branchId: true } },
        },
        orderBy: { id: "asc" },
      })
    : [];

  // CP2 lock 2 — บริบทกัน accidental duplicate: ยอดที่บรรทัดต้นทางเดียวกันถูกวางแผนไว้ใน
  // เที่ยว active อื่น (ไม่นับเที่ยวที่ยกเลิก/กระทบยอดแล้ว และไม่นับเที่ยวนี้เอง) — แสดงเป็น
  // บริบท/คำเตือนเท่านั้น ไม่ hard-block และไม่ใช่ enforced quantity (แผน ≠ ขึ้นจริง)
  const sourceIds = eligibleLines.map((l) => l.id);
  const plannedElsewhereRows = sourceIds.length
    ? await db.loadingLine.groupBy({
        by: ["customerPoLineId"],
        where: {
          customerPoLineId: { in: sourceIds },
          drop: { trip: { id: { not: trip.id }, cancelledAt: null, reconciledAt: null } },
        },
        _sum: { qtyPlanned: true },
      })
    : [];
  const plannedElsewhereById = new Map(plannedElsewhereRows.map((r) => [r.customerPoLineId as string, r._sum.qtyPlanned ?? 0]));

  // CP3 lock 7 — OUTSTANDING picker: บัตรค้างเปิดอยู่ของลูกค้าในเที่ยวนี้ (closed ไม่ eligible)
  // พร้อม metadata: สินค้า/ไซส์/เริ่มค้างเท่าไร/เหลือ/ค้างตั้งแต่/อายุ/ออเดอร์ต้นทาง — ไม่ FIFO
  // ไม่ auto-select คนเลือกเอง
  const openOutstandings = await db.outstandingDelivery.findMany({
    where: { closedAt: null },
    include: { allocations: { select: { qty: true } } },
    orderBy: { openedAt: "asc" },
  });
  const outLineIds = [...new Set(openOutstandings.map((o) => o.customerPoLineId))];
  const outLines = outLineIds.length
    ? await db.customerPOLine.findMany({
        where: { id: { in: outLineIds }, customerPo: { customerId: { in: dropCustomerIds } } },
        include: {
          product: { select: { sku: true, name: true, productionLabel: true } },
          customerPo: { select: { customerId: true, branchId: true, createdAt: true, orderSeqNo: true } },
        },
      })
    : [];
  const outLineById = new Map(outLines.map((l) => [l.id, l]));
  const outstandingByCustomer: TripEditorData["outstandingByCustomer"] = {};
  for (const o of openOutstandings) {
    const srcLine = outLineById.get(o.customerPoLineId);
    if (!srcLine) continue; // ลูกค้าไม่อยู่ในเที่ยวนี้
    const remaining = o.qtyOriginal - o.allocations.reduce((s, a) => s + a.qty, 0);
    if (remaining <= 0) continue;
    const cid = srcLine.customerPo.customerId;
    (outstandingByCustomer[cid] ??= []).push({
      id: o.id,
      label: srcLine.product?.productionLabel ?? srcLine.product?.name ?? "—",
      size: srcLine.size,
      qtyOriginal: o.qtyOriginal,
      remaining,
      openedAt: o.openedAt.toLocaleDateString("th-TH"),
      ageDays: Math.floor((Date.now() - o.openedAt.getTime()) / 86400000),
      sourceBranchName: srcLine.customerPo.branchId ? branchNameById.get(srcLine.customerPo.branchId) ?? null : null,
      poInfo: `ออเดอร์ ${srcLine.customerPo.createdAt.toLocaleDateString("th-TH")}${srcLine.customerPo.orderSeqNo != null ? ` ครั้งที่ ${srcLine.customerPo.orderSeqNo}` : ""}`,
    });
  }

  const eligibleByCustomer: TripEditorData["eligibleByCustomer"] = {};
  for (const line of eligibleLines) {
    const cid = line.customerPo.customerId;
    (eligibleByCustomer[cid] ??= []).push({
      id: line.id,
      label: line.product?.productionLabel ?? line.product?.name ?? "—",
      sku: line.product?.sku ?? null,
      size: line.size,
      qtyCurrent: line.qtyCurrent,
      sourceBranchId: line.customerPo.branchId,
      sourceBranchName: line.customerPo.branchId ? branchNameById.get(line.customerPo.branchId) ?? null : null,
      plannedElsewhere: plannedElsewhereById.get(line.id) ?? 0,
      poInfo: `ออเดอร์ ${line.customerPo.createdAt.toLocaleDateString("th-TH")}${line.customerPo.orderSeqNo != null ? ` ครั้งที่ ${line.customerPo.orderSeqNo}` : ""}`,
    });
  }

  const editorData: TripEditorData = {
    tripId: trip.id,
    version: trip.version,
    destinations: settings.destinations,
    header: {
      tripDate: trip.tripDate.toISOString().slice(0, 10),
      plateNumber: trip.plateNumber ?? "",
      driverName: trip.driverName ?? "",
      note: trip.note ?? "",
    },
    drops: trip.drops.map((d) => ({
      id: d.id,
      seq: d.seq,
      customerId: d.customerId,
      branchId: d.branchId,
      customerName: customerNameById.get(d.customerId) ?? "(ลูกค้าถูกปิดใช้งาน)",
      branchName: d.branchId ? branchNameById.get(d.branchId) ?? null : null,
      prodNo: d.productionOrderId ? prodNoById.get(d.productionOrderId) ?? null : null,
      destinationLabel: d.destinationLabel,
      note: d.note,
      lines: d.lines.map((l) => ({
        id: l.id,
        label: l.labelSnapshot,
        sku: l.skuSnapshot,
        size: l.size,
        qtyPlanned: l.qtyPlanned,
        customerPoLineId: l.customerPoLineId,
        sourceType: l.sourceType,
        plannedElsewhere: l.customerPoLineId ? plannedElsewhereById.get(l.customerPoLineId) ?? 0 : 0,
      })),
    })),
    customers: customers.map((c) => ({ id: c.id, name: c.companyName, branches: c.branches })),
    eligibleByCustomer,
    outstandingByCustomer,
    products: products.map((p) => ({ id: p.id, label: `${p.productionLabel ?? p.name}${p.size ? ` (${p.size})` : ""} · ${p.sku}`, size: p.size })),
    plateSuggestions,
  };

  // CP3 — หลังกระทบยอดแล้ว โชว์สรุปว่าแต่ละรายการตัดจากอะไร (อ่านจาก ledger จริง)
  const allocationsByLine = new Map<string, { kind: string; qty: number }[]>();
  if (trip.reconciledAt) {
    const lineIds = trip.drops.flatMap((d) => d.lines.map((l) => l.id));
    const allocs = lineIds.length
      ? await db.loadingAllocation.findMany({ where: { loadingLineId: { in: lineIds } }, select: { loadingLineId: true, kind: true, qty: true } })
      : [];
    for (const a of allocs) {
      if (!a.loadingLineId) continue;
      (allocationsByLine.get(a.loadingLineId) ?? allocationsByLine.set(a.loadingLineId, []).get(a.loadingLineId)!).push({ kind: a.kind, qty: a.qty });
    }
  }
  const ALLOC_LABEL: Record<string, string> = { FRESH: "ตัดออเดอร์ใหม่", OUTSTANDING: "ตัดของค้างเดิม", ADHOC: "ของหน้างาน" };

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref="/production/loading" />
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">
          รอบจัดส่ง <span className="text-xs text-gray-400 font-mono font-normal">{trip.tripNo}</span>
        </h1>
        <StatusBadge {...badge} />
      </div>
      <p className="text-sm text-gray-500 mb-3">
        ออกรถ {trip.tripDate.toLocaleDateString("th-TH")}
        {(trip.plateNumber || trip.driverName) && ` · ${[trip.plateNumber, trip.driverName].filter(Boolean).join(" ")}`} — {trip.drops.length} จุดส่ง · {totalLines} รายการ
        {/* CP7 item 6 — indicator รวมหลายใบผลิตเข้ารอบเดียวกัน ให้เห็นชัดทั้ง list และ detail */}
        {new Set(trip.drops.map((d) => d.productionOrderId).filter(Boolean)).size > 1 && (
          <span className="ml-1.5 inline-block text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 align-middle">
            รวม {new Set(trip.drops.map((d) => d.productionOrderId).filter(Boolean)).size} ใบผลิตในรอบนี้
          </span>
        )}
      </p>

      {trip.cancelledAt && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2 mb-3">
          ✕ เที่ยวนี้ถูกยกเลิกเมื่อ {trip.cancelledAt.toLocaleString("th-TH")}
          {trip.cancelledById && ` โดย ${actorNameById.get(trip.cancelledById) ?? ""}`}
          {trip.cancelReason && ` — เหตุผล: ${trip.cancelReason}`}
        </div>
      )}
      {trip.reconciledAt && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-3 py-2 mb-3">
          ✓ สินค้าถูกส่งออกแล้วเมื่อ {trip.reconciledAt.toLocaleString("th-TH")}
          {trip.loadedById && ` โดย ${actorNameById.get(trip.loadedById) ?? ""}`} — ยอดขึ้นจริงและการตัดยอดถูกบันทึกครบแล้ว
        </div>
      )}
      {isDraft && trip.sheetPrintedAt && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-3 py-2 mb-3">
          🖨 พิมพ์ใบขึ้นของแล้วเมื่อ {trip.sheetPrintedAt.toLocaleString("th-TH")} — ของเข้าคิว
          "รอบันทึกผล" ที่หน้าคิวหลักแล้ว บันทึกผลขึ้นของได้จากตรงนั้น
          {trip.sheetPrintedVersion != null && trip.version > trip.sheetPrintedVersion && (
            <span className="block mt-1 font-medium">
              ⚠ แผนถูกแก้หลังพิมพ์ — ใบที่พิมพ์ไว้อาจไม่ตรงแผนล่าสุด แนะนำพิมพ์ใหม่ก่อนขึ้นของ
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <a
          href={`/production/loading/${trip.id}/print`}
          className="inline-block text-xs px-2 py-0.5 rounded-full bg-green-700 text-white hover:bg-green-800"
        >
          พิมพ์ใบขึ้นของ
        </a>
        {canManage && isDraft && (
          <CancelDocumentButton
            buttonLabel="ยกเลิกรอบจัดส่ง"
            modalTitle="ยกเลิกรอบจัดส่งนี้?"
            warningLines={[
              "ยกเลิกได้เฉพาะรอบที่ยังไม่บันทึกผลขึ้นของ — ไม่กระทบออเดอร์/ใบสั่งผลิตใดๆ",
              "รอบที่ยกเลิกจะไม่ถูกนับเป็นแผน/ยอดขึ้นของอีก — การยกเลิกถอนกลับไม่ได้",
            ]}
            danger={false}
            version={trip.version}
            action={cancelLoadingTrip.bind(null, trip.id)}
          />
        )}
      </div>

      {canManage && isDraft ? (
        <LoadingTripEditor data={editorData} />
      ) : (
        // อ่านอย่างเดียว (LOADED/RECONCILED/CANCELLED หรือไม่มีสิทธิ์): แผน vs ขึ้นจริง + รูป
        <div className="space-y-2">
          {trip.drops.map((drop, idx) => (
            <div key={drop.id} className="bg-white border rounded-lg p-3">
              <div className="text-sm font-medium mb-1">
                {idx + 1}. {customerNameById.get(drop.customerId) ?? "—"}
                {drop.branchId && <span className="text-gray-500"> — {branchNameById.get(drop.branchId) ?? ""}</span>}
                {drop.productionOrderId && (
                  <span className="text-xs text-gray-400 font-mono font-normal ml-1.5">{prodNoById.get(drop.productionOrderId) ?? ""}</span>
                )}
                {drop.note && <span className="text-xs text-gray-500 font-normal"> · {drop.note}</span>}
              </div>
              {drop.lines.length === 0 ? (
                <p className="text-xs text-gray-400">ไม่มีรายการ</p>
              ) : (
                <div className="space-y-1">
                  {drop.lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between gap-2 text-sm border-b border-dashed pb-1">
                      <span className="min-w-0">
                        {line.labelSnapshot}
                        {line.size && <span className="text-gray-500"> (ไซส์ {line.size})</span>}
                      </span>
                      <span className="shrink-0 text-xs text-right">
                        แผน <span className="font-semibold">{line.qtyPlanned}</span>
                        {line.qtyLoaded != null && (
                          <>
                            {" · "}ขึ้นจริง{" "}
                            <span className={`font-semibold ${line.qtyLoaded !== line.qtyPlanned ? "text-amber-700" : "text-green-700"}`}>{line.qtyLoaded}</span>
                          </>
                        )}
                        {allocationsByLine.has(line.id) && (
                          <span className="block text-gray-500">
                            {allocationsByLine.get(line.id)!.map((a) => `${ALLOC_LABEL[a.kind] ?? a.kind} ${a.qty}`).join(" · ")}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {drop.photoPaths.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {drop.photoPaths.map((p) => (
                    <a key={p} href={`/api/production/loading-photos/${p}`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/production/loading-photos/${p}`} alt="รูปใบขึ้นของ" className="w-16 h-16 object-cover rounded border" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!canManage && isDraft && (
            <p className="text-xs text-gray-400">คุณไม่มีสิทธิ์แก้ไขเที่ยวรถ — ดูข้อมูลได้อย่างเดียว</p>
          )}
        </div>
      )}
    </div>
  );
}
