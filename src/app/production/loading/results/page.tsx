import { getLoadingQueueData, type LoadingTripGroup } from "@/lib/loading-queue-data";

// CP7 round 3 (2026-08-30, Owner UAT) — "บันทึกผลขึ้นของ" เป็นเมนูหลักแยกต่างหาก (ไม่ใช่
// section ในหน้าคิว) ตรงตาม mental model: พิมพ์ใบขึ้นของแล้วออเดอร์ย้ายมาอยู่หมวดนี้ กดเข้า
// แต่ละใบ = เข้าฟอร์มบันทึกผลตรงๆ (ถ่ายรูป/คีย์ยอดจริง) ไม่ผ่านหน้ารอบจัดส่งอีกที — query
// กลางร่วมกับหน้าคิวที่ src/lib/loading-queue-data.ts (สถานะ derive สูตรเดียวกันเป๊ะ)
//
// CP7 round 12 (Owner UAT) — 2 จุดที่แก้: (1) การ์ดในนี้จัดกลุ่มตามรอบจัดส่งจริง (tripId)
// แล้ว ไม่ใช่ต่อใบผลิตเหมือนก่อนหน้านี้ — รอบที่ลากรวมกันมาตั้งแต่หน้าคิวจะเห็นเป็น 1 การ์ด
// เดียวกัน ตรงกับที่กดเข้าไปแล้วเจอฟอร์มบันทึกผลใบเดียวจริงๆ (2) "ส่งออกแล้วล่าสุด" ย้ายมา
// จากหน้าคิว มาอยู่ที่นี่แทน — ตรง Mental Model กว่า (เป็นประวัติ/ผลลัพธ์ ไม่ใช่คิวที่ต้องขึ้น)
export default async function LoadingResultsPage() {
  const { awaitingResult, dispatched } = await getLoadingQueueData();

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">บันทึกผลขึ้นของ</h1>
      <p className="text-sm text-gray-500 mb-4">
        ออเดอร์ที่พิมพ์ใบขึ้นของแล้ว — กดเข้าไปกรอกยอดขึ้นจริง แนบรูปยืนยัน แล้วยืนยันส่งออก ·{" "}
        <a href="/production/loading" className="text-blue-600 hover:underline">กลับไปคิวขึ้นของ</a>
      </p>

      {awaitingResult.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500 text-center">ไม่มีงานรอบันทึกผล</div>
      ) : (
        <div className="space-y-2">
          {awaitingResult.map((trip) => (
            <TripCard key={trip.tripId} trip={trip} href={`/production/loading/${trip.tripId}/finalize`} statusLabel="รอบันทึกผลขึ้นของ" statusClassName="bg-amber-100 text-amber-800" borderClassName="border-2 border-amber-300 hover:border-amber-500" />
          ))}
        </div>
      )}

      {dispatched.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-gray-700 mt-6 mb-2">ส่งออกแล้วล่าสุด</h2>
          <div className="space-y-2">
            {dispatched.map((trip) => (
              <TripCard key={trip.tripId} trip={trip} href={`/production/loading/${trip.tripId}`} statusLabel="สินค้าถูกส่งออกแล้ว" statusClassName="bg-green-100 text-green-700" borderClassName="border hover:border-cp-navy opacity-70" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TripCard({
  trip,
  href,
  statusLabel,
  statusClassName,
  borderClassName,
}: {
  trip: LoadingTripGroup;
  href: string;
  statusLabel: string;
  statusClassName: string;
  borderClassName: string;
}) {
  return (
    <a href={href} className={`block bg-white rounded-lg p-3 ${borderClassName}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trip.urgency.className}`}>{trip.urgency.label}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusClassName}`}>{statusLabel}</span>
      </div>
      <div className="text-sm text-gray-700 mt-1 flex items-center gap-1.5 flex-wrap">
        <span className="font-medium">{trip.customerLabel}</span>
        {trip.mergedCount > 1 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">รวม {trip.mergedCount} ใบผลิต</span>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">
        {trip.itemCount} รายการ · {trip.pieceCount} ชิ้น
        <span className="text-gray-400 font-mono ml-2">{trip.prodNos.join(", ")}</span>
      </div>
    </a>
  );
}
