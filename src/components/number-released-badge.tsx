// Owner UAT (2026-08-31) — เอกสารที่ถูกยกเลิก+ดึงเลขคืนใช้ใหม่แล้ว (numberReleased=true)
// ยังแสดงเลขที่เดิมเป๊ะ (ไม่ Rename — ดู running-number-reclaim.ts) แต่ต้องมี Badge บอกให้
// ชัดว่าเลขนี้ไม่ใช่เจ้าของ Active อีกต่อไป กันสับสนกับเอกสารใหม่ที่ใช้เลขเดียวกัน — Owner
// ระบุตรงๆ ว่าไม่ต้องการเห็นเลขที่แปลกๆ (VOID-xxxxx) มีแค่ Badge นี้พอ
export function NumberReleasedBadge() {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
      คืนเลขแล้ว
    </span>
  );
}
