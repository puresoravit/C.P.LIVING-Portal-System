import { getLoadingQueueData } from "@/lib/loading-queue-data";
import { toDateInputValue } from "@/lib/date-utils";
import { displayProdNo } from "@/lib/production-order-display";
import { DraggableQueueList, type DraggableQueueItem } from "@/components/production/draggable-queue-list";
import type { StatusBadgeConfig } from "@/components/status-badge";

// CP6 Queue-first — หน้า "การขึ้นของและจัดส่ง" = คิวงานที่จะขึ้นของ (ไม่ใช่ list เที่ยวรถ):
// ดึงใบสั่งผลิต active อัตโนมัติ เรียงตามวันที่ต้องการส่ง (สำคัญสุด) — เลขใบผลิตเป็นตัวเล็ก
// อ้างอิงรอง — กดใบไหน = ตรวจของ + ยืนยันขึ้นวันนี้ → เข้าหน้าเตรียมขึ้นของของ "รอบจัดส่ง"
//
// CP7 (2026-08-30, Owner UAT) — badge ความเร่งด่วนตามวันส่งแยกจาก badge สถานะงาน · "กำลังขึ้น
// ของ" เกิดหลังพิมพ์ใบแล้วเท่านั้น (ก่อนพิมพ์ = "เตรียมขึ้นของ")
//
// CP7 round 3 (2026-08-30, Owner UAT) — "บันทึกผลขึ้นของ" ย้ายออกเป็นเมนูหลักแยกต่างหาก
// (/production/loading/results) ไม่ใช่แค่ section ในหน้านี้อีกต่อไป — หน้านี้เหลือแค่งานที่
// ยังไม่พิมพ์ + ส่งออกแล้วล่าสุด · query กลางอยู่ที่ src/lib/loading-queue-data.ts ให้สอง
// หน้าใช้สูตรเดียวกัน
//
// CP7 round 7 (2026-08-30, Owner UAT — สั่งซ้ำเป็นครั้งที่ 2) — คิวขึ้นของลากการ์ดไปทับกันได้
// จริงแล้ว (DraggableQueueList) ไม่ใช่แค่ปุ่ม "ส่งวันนี้แทน" (ยังคงไว้เป็นทางเลือกที่กดง่าย
// กว่าบนมือถือ) — ลากได้เฉพาะการ์ดที่มีวันที่กำหนดแล้ว (ยังไม่กำหนด = ไม่มีวันที่ให้อ้างอิง)

const QUEUE_BADGE: StatusBadgeConfig = {
  PRODUCING: { label: "กำลังผลิต", className: "bg-green-100 text-green-700" },
  WAITING_PRODUCTION: { label: "รอเริ่มผลิต", className: "bg-blue-100 text-blue-700" },
  PREPARING: { label: "เตรียมขึ้นของ", className: "bg-blue-100 text-blue-700" },
};

export default async function LoadingQueuePage() {
  const { queue, dispatched } = await getLoadingQueueData();

  const draggableItems: DraggableQueueItem[] = queue.map(({ o, status, urgency, itemCount, pieceCount }) => ({
    id: o.id,
    customerPoId: o.customerPoId,
    version: o.customerPo.version,
    href: status.tripId ? `/production/loading/${status.tripId}` : `/production/loading/start/${o.id}`,
    urgencyLabel: urgency.label,
    urgencyClassName: urgency.className,
    statusKey: status.key,
    customerName: o.customerPo.customer.companyName,
    branchName: o.customerPo.branch?.name ?? null,
    isUrgent: o.customerPo.urgency,
    mergedCount: status.mergedCount,
    itemCount,
    pieceCount,
    prodNo: displayProdNo(o.prodNo, o.currentRevNo),
    requestedDateLabel: o.customerPo.requestedDate ? o.customerPo.requestedDate.toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "ยังไม่กำหนด",
    requestedDateIso: o.customerPo.requestedDate ? toDateInputValue(o.customerPo.requestedDate) : null,
    showPullForward: urgency.level !== "TODAY" && urgency.level !== "OVERDUE",
  }));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">การขึ้นของและจัดส่ง</h1>
        <a href="/production/loading/start-stock" className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg px-4 py-2">
          + เพิ่มรายการขึ้นของ
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        เรียงตามความเร่งด่วน — กดออเดอร์เพื่อตรวจของและเริ่มขึ้น หรือลากการ์ดไปทับกันเพื่อส่งพร้อมกัน · พิมพ์ใบแล้วไปบันทึกผลที่{" "}
        <a href="/production/loading/results" className="text-blue-600 hover:underline">บันทึกผลขึ้นของ</a> ·{" "}
        <a href="/production/loading/trips" className="text-blue-600 hover:underline">ดูรอบจัดส่งทั้งหมด</a>
      </p>

      {draggableItems.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500 text-center">ไม่มีงานรอขึ้นของ</div>
      ) : (
        <DraggableQueueList items={draggableItems} badgeConfig={QUEUE_BADGE} />
      )}

      {dispatched.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-gray-700 mt-6 mb-2">ส่งออกแล้วล่าสุด</h2>
          <div className="space-y-2">
            {dispatched.map(({ o, status }) => (
              <a key={o.id} href={`/production/loading/${status.tripId}`} className="block bg-white border rounded-lg p-3 hover:border-cp-navy opacity-70">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {o.customerPo.customer.companyName}
                    {o.customerPo.branch && <span className="text-gray-500"> — {o.customerPo.branch.name}</span>}
                    <span className="text-xs text-gray-400 font-mono ml-2">{o.prodNo}</span>
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">สินค้าถูกส่งออกแล้ว</span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
