// CP7 round 13 (Owner UAT) — Route alias: เดิมหน้ารอบจัดส่ง (/production/loading/[id])
// ถูกใช้ทั้งตอน "ยังเตรียมของอยู่" (เข้าจากคิว "การขึ้นของและจัดส่ง") และตอน "จบงานแล้ว"
// (เข้าจาก "บันทึกผลขึ้นของ" ส่วนส่งออกแล้วล่าสุด) — Path เดียวกันเป๊ะ ทำให้เมนู Sidebar
// เลือกไฮไลต์ผิดฝั่งเสมอ (data-dependent ไม่ใช่ URL-shape ล้วนๆ แก้ด้วย Regex ไม่ได้จริง
// เคยลองแล้วรอบ 12 พังเพราะ RegExp ข้าม Server→Client Props ไม่ได้ด้วย) — ทางแก้ที่ตรงและ
// ปลอดภัยกว่า: มีอีก Path หนึ่งที่ Nest อยู่ใต้ /production/loading/results ตรงๆ (ให้
// Prefix-match ปกติทำงานถูกเอง ไม่ต้องมี Alias พิเศษ) render Component เดิมซ้ำเป๊ะ (ไม่มี
// Logic ใหม่ ไม่มีการ Duplicate โค้ด) — ใช้เฉพาะ Link จากหน้า "บันทึกผลขึ้นของ" เท่านั้น
export { default } from "../../[id]/page";
