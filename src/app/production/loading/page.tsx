import { db } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { loadingTripStatusBadge } from "@/lib/production-status-badges";

// P2 CP1 — แทน stub เดิม: รายการเที่ยวรถ (mobile-first การ์ด) — สถานะ derive จาก timestamp
// facts ผ่าน helper กลาง (CP1 มีแต่ "วางแผน" — state อื่นมาพร้อม CP2/CP3)
export default async function LoadingTripsPage() {
  const trips = await db.loadingTrip.findMany({
    orderBy: { createdAt: "desc" },
    include: { drops: { orderBy: { seq: "asc" }, select: { customerId: true, _count: { select: { lines: true } } } } },
    take: 100,
  });

  const customerIds = [...new Set(trips.flatMap((t) => t.drops.map((d) => d.customerId)))];
  const customers = customerIds.length
    ? await db.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, companyName: true } })
    : [];
  const customerNameById = new Map(customers.map((c) => [c.id, c.companyName]));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">การขึ้นของและจัดส่ง</h1>
        <a href="/production/loading/new" className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg px-4 py-2">
          + สร้างเที่ยวรถ
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">เที่ยวรถทั้งหมด — หนึ่งเที่ยวส่งได้หลายลูกค้า/หลายจุด</p>

      {trips.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500">ยังไม่มีเที่ยวรถ</div>
      ) : (
        <div className="space-y-2">
          {trips.map((trip) => {
            const badge = loadingTripStatusBadge(trip);
            const destinations = [...new Set(trip.drops.map((d) => customerNameById.get(d.customerId) ?? d.customerId))];
            const lineCount = trip.drops.reduce((sum, d) => sum + d._count.lines, 0);
            return (
              <a
                key={trip.id}
                href={`/production/loading/${trip.id}`}
                className="block bg-white border rounded-lg p-3 hover:border-cp-navy"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">{trip.tripNo}</span>
                  <StatusBadge {...badge} />
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  ออกรถ {trip.tripDate.toLocaleDateString("th-TH")}
                  {trip.vehicleNote && ` · ${trip.vehicleNote}`}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {trip.drops.length} จุดส่ง · {lineCount} รายการ
                  {destinations.length > 0 && ` — ${destinations.slice(0, 3).join(", ")}${destinations.length > 3 ? ` +${destinations.length - 3}` : ""}`}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
