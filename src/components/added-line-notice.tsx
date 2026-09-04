"use client";

// ==========================================================================
// Owner UAT (2026-09-04) — ยืนยันผลหลังกด "+ เพิ่ม" ใน Modal แก้ไข Order/ใบเสนอราคา
//
// ปัญหาที่ Owner เจอจริง: ตั้งแต่ Stable Product Ordering (571dd6a) รายการที่เพิ่งเพิ่ม
// ถูกจัดเข้ากลุ่มสินค้าของตัวเอง ไม่ได้ต่อท้ายตารางเหมือนเดิม — ถ้าตารางยาว แถวใหม่ไป
// โผล่เหนือขอบจอ (วัดจริง: สูงกว่าขอบบน 1,307px และ Modal ไม่เลื่อนตามให้) ผู้ใช้เห็นแค่
// ช่องค้นหาถูกล้าง = เหมือนกดแล้วไม่ติด จึงไม่กด "บันทึกการแก้ไข" ต่อ → ยอดไม่เปลี่ยน
//
// แก้ที่ Feedback อย่างเดียว ไม่แตะการเรียง (การเรียงตามกลุ่มคือสิ่งที่ Owner สั่งไว้เอง)
// ==========================================================================
export function AddedLineNotice({
  label,
  position,
  total,
  onView,
}: {
  label: string;
  /** ลำดับที่แถวใหม่ไปอยู่จริงหลังจัดกลุ่ม (1-based) */
  position: number;
  total: number;
  onView: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-3 py-2">
      <span>
        ✓ เพิ่ม <b>{label}</b> แล้ว — อยู่ลำดับที่ {position} จาก {total} ในตาราง (เรียงตามกลุ่มสินค้าอัตโนมัติ)
        <br />
        <span className="text-emerald-700">อย่าลืมกด &quot;บันทึกการแก้ไข&quot; ด้านล่าง มิฉะนั้นยอดจะไม่ถูกแก้</span>
      </span>
      <button type="button" onClick={onView} className="underline font-medium shrink-0">
        ดูรายการ
      </button>
    </div>
  );
}
