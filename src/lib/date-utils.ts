// ห้ามใช้ `.toISOString().slice(0, 10)` กับ Date ที่สร้างแบบ local (`new Date(y, m, d)`)
// เพราะ toISOString() แปลงเป็น UTC ก่อนเสมอ — ใน timezone ที่เร็วกว่า UTC (เช่น
// ประเทศไทย UTC+7) จะได้วันที่ย้อนหลังไป 1 วันจากที่ตั้งใจ (เช่น เที่ยงคืนวันที่ 31
// ตามเวลาไทย = 17:00 ของวันที่ 30 ตาม UTC) ฟังก์ชันนี้อ่านค่า year/month/date แบบ
// local ตรงๆ ไม่ผ่าน UTC จึงไม่มีปัญหานี้
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfMonth(now: Date = new Date()): string {
  return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

// วันสุดท้ายของเดือนปัจจุบัน — `new Date(year, month+1, 0)` คือ "วันที่ 0" ของเดือน
// ถัดไป ซึ่ง JS ตีความเป็นวันสุดท้ายของเดือนก่อนหน้าเสมอ จึงได้ 28/29/30/31 ถูกต้อง
// ตามเดือนจริงโดยไม่ hardcode
export function endOfCurrentMonth(now: Date = new Date()): string {
  return toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}
