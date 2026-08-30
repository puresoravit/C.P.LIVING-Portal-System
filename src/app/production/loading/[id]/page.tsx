import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { StatusBadge } from "@/components/status-badge";
import { loadingTripStatusBadge } from "@/lib/production-status-badges";
import { BackLink } from "@/components/production/back-link";
import { LoadingTripEditor, type TripEditorData } from "@/components/production/loading-trip-editor";

// P2 CP1 — หน้า detail/แก้ไขเที่ยวรถ (DRAFT): เพิ่ม/ลบ/เรียงจุดส่ง + เพิ่ม/ลบรายการ (FRESH
// picker กรองออเดอร์ที่ถูกยกเลิก CP0 ออกเสมอ) — Server โหลดข้อมูล + ตัวเลือกทั้งหมด แล้วให้
// LoadingTripEditor (client) เรียก server actions รายตัว (ทุกตัว version CAS + audit)
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

  // ชื่อลูกค้า/สาขาของจุดส่งที่มีอยู่ + ลิสต์ลูกค้า active ทั้งหมดสำหรับ add-drop picker
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

  // FRESH picker (CP1): บรรทัด CATALOG active ของลูกค้าที่อยู่ในเที่ยวนี้ จากออเดอร์ที่ยังไม่
  // ถูกยกเลิก (CP0 fact) — จัดกลุ่มต่อ customerId ให้ editor ใช้ตอนเพิ่มรายการต่อจุดส่ง
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
  const eligibleByCustomer: TripEditorData["eligibleByCustomer"] = {};
  for (const line of eligibleLines) {
    const cid = line.customerPo.customerId;
    (eligibleByCustomer[cid] ??= []).push({
      id: line.id,
      label: line.product?.productionLabel ?? line.product?.name ?? "—",
      sku: line.product?.sku ?? null,
      size: line.size,
      qtyCurrent: line.qtyCurrent,
      poInfo: `ออเดอร์ ${line.customerPo.createdAt.toLocaleDateString("th-TH")}${line.customerPo.orderSeqNo != null ? ` ครั้งที่ ${line.customerPo.orderSeqNo}` : ""}${line.customerPo.branchId ? ` (${branchNameById.get(line.customerPo.branchId) ?? ""})` : ""}`,
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
      customerName: customerNameById.get(d.customerId) ?? "(ลูกค้าถูกปิดใช้งาน)",
      branchName: d.branchId ? branchNameById.get(d.branchId) ?? null : null,
      note: d.note,
      lines: d.lines.map((l) => ({ id: l.id, label: l.labelSnapshot, sku: l.skuSnapshot, size: l.size, qtyPlanned: l.qtyPlanned })),
    })),
    customers: customers.map((c) => ({ id: c.id, name: c.companyName, branches: c.branches })),
    eligibleByCustomer,
  };

  const totalLines = trip.drops.reduce((sum, d) => sum + d.lines.length, 0);

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref="/production/loading" />
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">{trip.tripNo}</h1>
        <StatusBadge {...badge} />
      </div>
      <p className="text-sm text-gray-500 mb-4">
        ออกรถ {trip.tripDate.toLocaleDateString("th-TH")}
        {trip.vehicleNote && ` · ${trip.vehicleNote}`} — {trip.drops.length} จุดส่ง · {totalLines} รายการ
      </p>

      {canManage && isDraft ? (
        <LoadingTripEditor data={editorData} />
      ) : (
        <div className="bg-white border border-dashed rounded-lg p-4 text-sm text-gray-500">
          เที่ยวรถนี้พ้นขั้นตอนวางแผนแล้ว หรือคุณไม่มีสิทธิ์แก้ไข — ดูข้อมูลได้อย่างเดียว
        </div>
      )}
    </div>
  );
}
