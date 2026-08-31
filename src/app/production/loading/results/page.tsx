import { getLoadingQueueData } from "@/lib/loading-queue-data";
import { displayProdNo } from "@/lib/production-order-display";

// CP7 round 3 (2026-08-30, Owner UAT) — "บันทึกผลขึ้นของ" เป็นเมนูหลักแยกต่างหาก (ไม่ใช่
// section ในหน้าคิว) ตรงตาม mental model: พิมพ์ใบขึ้นของแล้วออเดอร์ย้ายมาอยู่หมวดนี้ กดเข้า
// แต่ละใบ = เข้าฟอร์มบันทึกผลตรงๆ (ถ่ายรูป/คีย์ยอดจริง) ไม่ผ่านหน้ารอบจัดส่งอีกที — query
// กลางร่วมกับหน้าคิวที่ src/lib/loading-queue-data.ts (สถานะ derive สูตรเดียวกันเป๊ะ)
export default async function LoadingResultsPage() {
  const { awaitingResult } = await getLoadingQueueData();

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
          {awaitingResult.map(({ o, status, urgency, itemCount, pieceCount }) => (
            <a
              key={o.id}
              href={`/production/loading/${status.tripId}/finalize`}
              className="block bg-white border-2 border-amber-300 rounded-lg p-3 hover:border-amber-500"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urgency.className}`}>{urgency.label}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">รอบันทึกผลขึ้นของ</span>
              </div>
              <div className="text-sm text-gray-700 mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="font-medium">{o.customerPo.customer.companyName}</span>
                {o.customerPo.branch && <span className="text-gray-500">— {o.customerPo.branch.name}</span>}
                {status.mergedCount != null && status.mergedCount > 1 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">รวม {status.mergedCount} ใบผลิต</span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {itemCount} รายการ · {pieceCount} ชิ้น
                <span className="text-gray-400 font-mono ml-2">{displayProdNo(o.prodNo, o.currentRevNo)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
