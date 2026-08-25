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

/** "วันนี้" ตามเวลา Local ของเครื่อง (Asia/Bangkok บน Production) ในรูปแบบ YYYY-MM-DD
 * สำหรับ Default ของช่องวันที่เอกสารทุกฟอร์ม — Production Prep (Timezone Audit): เดิม
 * ทุกฟอร์มใช้ `new Date().toISOString().slice(0, 10)` ซึ่งเป็น "วันที่ตาม UTC" → ช่วง
 * 00:00-06:59 เวลาไทยจะได้วันที่ย้อนหลัง 1 วัน (บั๊กแฝงที่มีมาตั้งแต่รันบนเครื่อง Mac
 * แต่ไม่มีใครคีย์งานช่วงตีหนึ่งถึงเจ็ดโมงเช้าจึงไม่เคยโผล่) */
export function todayInputValue(): string {
  return toDateInputValue(new Date());
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

// Stabilization — Invalid URL Date Param Hardening: ทุกหน้า List/Report รับ dateFrom/dateTo
// จาก Query String แล้วส่งเข้า `new Date(x)` ตรงๆ — ค่าผิดรูปแบบ (พิมพ์ URL ผิด/Bookmark
// เก่า/Query ถูกแก้) กลายเป็น Invalid Date → Prisma Throw → ทั้งหน้าลงไป Error Boundary
// (Reproduce: /orders?dateFrom=not-a-date) — Helper นี้รับเฉพาะรูปแบบ YYYY-MM-DD ที่เป็น
// วันที่จริง (ปฏิเสธ 2026-99-99 ด้วย ไม่ใช่แค่ Regex) นอกนั้นตกไปใช้ Default ของหน้านั้นๆ
// เหมือนกรณีไม่ส่ง Param มาเลย — ค่าที่ถูกต้องผ่านไปโดยไม่เปลี่ยนแปลงใดๆ (Zero Regression)
export function safeDateParam(value: string | undefined, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  // กัน Overflow เช่น 2026-02-31 ที่ JS ปัดเป็น 3 มี.ค. เงียบๆ — ต้อง Round-trip กลับเป็นค่าเดิม
  return d.toISOString().slice(0, 10) === value ? value : fallback;
}
