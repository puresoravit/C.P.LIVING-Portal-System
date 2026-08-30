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

// P2 CP1/CP2 — หน้า detail เที่ยวรถ: ช่วง DRAFT = editor เต็ม (จุดส่ง/รายการ + FRESH picker
// ที่กรองออเดอร์ยกเลิก + default กรองตรงสาขา + โชว์ยอดที่ถูกแผนไว้เที่ยวอื่น กัน accidental
// duplicate โดยไม่ hard-block) — หลัง LOADED = อ่านอย่างเดียว โชว์แผน vs ขึ้นจริง + รูปหลักฐาน
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

  const [customers, branches] = await Promise.all([
    db.customer.findMany({
      where: { active: true },
      select: { id: true, companyName: true, branches: { where: { active: true }, select: { id: true, name: true } } },
      orderBy: { companyName: "asc" },
    }),
    db.branch.findMany({ select: { id: true, name: true } }),
  ]);
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const customerNameById = new Map(customers.map((c) => [c.id, c.companyName]));

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
    header: {
      tripDate: trip.tripDate.toISOString().slice(0, 10),
      vehicleNote: trip.vehicleNote ?? "",
      note: trip.note ?? "",
    },
    drops: trip.drops.map((d) => ({
      id: d.id,
      seq: d.seq,
      customerId: d.customerId,
      branchId: d.branchId,
      customerName: customerNameById.get(d.customerId) ?? "(ลูกค้าถูกปิดใช้งาน)",
      branchName: d.branchId ? branchNameById.get(d.branchId) ?? null : null,
      note: d.note,
      lines: d.lines.map((l) => ({
        id: l.id,
        label: l.labelSnapshot,
        sku: l.skuSnapshot,
        size: l.size,
        qtyPlanned: l.qtyPlanned,
        customerPoLineId: l.customerPoLineId,
        plannedElsewhere: l.customerPoLineId ? plannedElsewhereById.get(l.customerPoLineId) ?? 0 : 0,
      })),
    })),
    customers: customers.map((c) => ({ id: c.id, name: c.companyName, branches: c.branches })),
    eligibleByCustomer,
  };

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref="/production/loading" />
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">{trip.tripNo}</h1>
        <StatusBadge {...badge} />
      </div>
      <p className="text-sm text-gray-500 mb-3">
        ออกรถ {trip.tripDate.toLocaleDateString("th-TH")}
        {trip.vehicleNote && ` · ${trip.vehicleNote}`} — {trip.drops.length} จุดส่ง · {totalLines} รายการ
      </p>

      {trip.cancelledAt && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2 mb-3">
          ✕ เที่ยวนี้ถูกยกเลิกเมื่อ {trip.cancelledAt.toLocaleString("th-TH")}
          {trip.cancelledById && ` โดย ${actorNameById.get(trip.cancelledById) ?? ""}`}
          {trip.cancelReason && ` — เหตุผล: ${trip.cancelReason}`}
        </div>
      )}
      {trip.loadedAt && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-3 py-2 mb-3">
          ✓ ยืนยันขึ้นของจริงแล้วเมื่อ {trip.loadedAt.toLocaleString("th-TH")}
          {trip.loadedById && ` โดย ${actorNameById.get(trip.loadedById) ?? ""}`} — แผนถูกล็อก แก้ไขต่อได้ที่ขั้นกระทบยอด
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <a
          href={`/production/loading/${trip.id}/print`}
          className="inline-block text-xs px-2 py-0.5 rounded-full bg-cp-navy text-white hover:bg-cp-navy-light"
        >
          พิมพ์ใบขึ้นของ
        </a>
        {canManage && isDraft && totalLines > 0 && (
          <a
            href={`/production/loading/${trip.id}/confirm`}
            className="inline-block text-xs px-2 py-0.5 rounded-full bg-green-700 text-white hover:bg-green-800"
          >
            ยืนยันขึ้นของจริง
          </a>
        )}
        {canManage && isDraft && (
          <CancelDocumentButton
            buttonLabel="ยกเลิกเที่ยว"
            modalTitle="ยกเลิกเที่ยวรถนี้?"
            warningLines={[
              "ยกเลิกได้เฉพาะเที่ยวที่ยังไม่ยืนยันขึ้นของ — ไม่กระทบออเดอร์/ใบสั่งผลิตใดๆ",
              "เที่ยวที่ยกเลิกจะไม่ถูกนับเป็นแผน/ยอดขึ้นของอีก — การยกเลิกถอนกลับไม่ได้",
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
                      <span className="shrink-0 text-xs">
                        แผน <span className="font-semibold">{line.qtyPlanned}</span>
                        {line.qtyLoaded != null && (
                          <>
                            {" · "}ขึ้นจริง{" "}
                            <span className={`font-semibold ${line.qtyLoaded !== line.qtyPlanned ? "text-amber-700" : "text-green-700"}`}>{line.qtyLoaded}</span>
                          </>
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
