import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { BackLink } from "@/components/production/back-link";
import { ConfirmLoadingForm, type ConfirmLoadingData } from "@/components/production/confirm-loading-form";

// CP2 — หน้า "ยืนยันขึ้นของจริง": กรอกยอดที่ขึ้นรถจริงต่อรายการ (แผน ≠ ขึ้นจริง โดยชอบธรรม)
// + แนบรูปใบขีดนับต่อจุดส่ง (บังคับฝั่ง server ตอน submit) — นี่คือจุดเดียวที่ตั้ง loadedAt
// (การพิมพ์ใบขึ้นของไม่เกี่ยวกับ fact นี้)
export default async function ConfirmLoadingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  const trip = await db.loadingTrip.findUnique({
    where: { id: params.id },
    include: { drops: { orderBy: { seq: "asc" }, include: { lines: { orderBy: { id: "asc" } } } } },
  });
  if (!trip) notFound();

  const isDraft = !trip.loadedAt && !trip.cancelledAt;
  if (!isDraft || !can(role, "loadingTrip.manage")) {
    return (
      <div className="max-w-2xl">
        <BackLink fallbackHref={`/production/loading/${trip.id}`} />
        <div className="mt-3 bg-white border border-dashed rounded-lg p-4 text-sm text-gray-500">
          เที่ยวนี้พ้นขั้นตอนวางแผนไปแล้ว หรือคุณไม่มีสิทธิ์ยืนยันขึ้นของ
        </div>
      </div>
    );
  }

  const customerIds = [...new Set(trip.drops.map((d) => d.customerId))];
  const customers = customerIds.length
    ? await db.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, companyName: true } })
    : [];
  const customerNameById = new Map(customers.map((c) => [c.id, c.companyName]));

  const data: ConfirmLoadingData = {
    tripId: trip.id,
    tripNo: trip.tripNo,
    version: trip.version,
    drops: trip.drops.map((d, idx) => ({
      id: d.id,
      label: `${idx + 1}. ${customerNameById.get(d.customerId) ?? "—"}`,
      photoPaths: d.photoPaths,
      lines: d.lines.map((l) => ({ id: l.id, label: l.labelSnapshot, size: l.size, qtyPlanned: l.qtyPlanned })),
    })),
  };

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref={`/production/loading/${trip.id}`} />
      <h1 className="text-lg font-semibold mt-2 mb-1">ยืนยันขึ้นของจริง — {trip.tripNo}</h1>
      <p className="text-sm text-gray-500 mb-4">
        กรอก &quot;จำนวนที่ขึ้นรถจริง&quot; ตามที่นับได้ (ไม่จำเป็นต้องเท่ากับแผน — ขึ้นไม่ครบ/ไม่ได้ขึ้นใส่ตามจริง) และแนบรูปใบขึ้นของที่ขีดนับแล้วของทุกจุดส่ง —
        ยืนยันแล้วแผนจะถูกล็อก แก้ไขต่อได้ที่ขั้นกระทบยอดเท่านั้น
      </p>
      <ConfirmLoadingForm data={data} />
    </div>
  );
}
