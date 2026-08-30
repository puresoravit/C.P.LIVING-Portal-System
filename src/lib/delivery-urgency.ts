// CP7 (2026-08-30, Owner UAT) — คิวงานต้องดูแว๊บเดียวรู้ว่าอันไหนต้องรีบ: badge ความเร่งด่วน
// ตามวันที่ต้องการ แยกจาก badge สถานะงาน (กำลังผลิต/กำลังขึ้นของ/ฯลฯ) โดยสิ้นเชิง — วันสำคัญ
// กว่าสถานะเสมอในการตัดสินใจหน้างานว่าจะหยิบใบไหนก่อน
export type UrgencyLevel = "OVERDUE" | "TODAY" | "TOMORROW" | "SOON" | "LATER" | "UNSET";

export function deliveryUrgency(
  requestedDate: Date | null,
  dateMode: "UNSET" | "ESTIMATE" | "EXACT",
  now: Date = new Date()
): { level: UrgencyLevel; label: string; className: string; daysUntil: number | null } {
  if (!requestedDate || dateMode === "UNSET") {
    return { level: "UNSET", label: "ยังไม่กำหนดวันส่ง", className: "bg-gray-100 text-gray-600", daysUntil: null };
  }
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysUntil = Math.round((startOfDay(requestedDate).getTime() - startOfDay(now).getTime()) / 86400000);
  const prefix = dateMode === "ESTIMATE" ? "ประมาณ " : "";
  const dateText = requestedDate.toLocaleDateString("th-TH", { day: "numeric", month: "short" });

  if (daysUntil < 0) {
    return { level: "OVERDUE", label: `เกินกำหนด ${-daysUntil} วัน (${dateText})`, className: "bg-red-600 text-white", daysUntil };
  }
  if (daysUntil === 0) {
    return { level: "TODAY", label: `${prefix}ส่งวันนี้`, className: "bg-orange-500 text-white", daysUntil };
  }
  if (daysUntil === 1) {
    return { level: "TOMORROW", label: `${prefix}ส่งพรุ่งนี้`, className: "bg-amber-500 text-white", daysUntil };
  }
  if (daysUntil <= 6) {
    return { level: "SOON", label: `${prefix}อีก ${daysUntil} วัน (${dateText})`, className: "bg-yellow-100 text-yellow-800", daysUntil };
  }
  return { level: "LATER", label: `${prefix}${dateText}`, className: "bg-gray-100 text-gray-600", daysUntil };
}
