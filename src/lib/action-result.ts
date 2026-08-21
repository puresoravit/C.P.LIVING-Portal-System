// Phase E1/E2 — รูปแบบผลลัพธ์มาตรฐานสำหรับ Server Action ที่ต้องการส่ง error
// message ที่มีความหมายกลับไปแสดงผู้ใช้ได้จริง
//
// Root cause ของปัญหา "Cancel บางครั้ง Error บางครั้งไม่ Error": Next.js production
// build จะ redact ข้อความของ Error ที่ throw ออกมาจาก Server Component/Server Action
// เหลือแค่ข้อความทั่วไป "An error occurred in the Server Components render..." เสมอ
// (ยืนยันแล้วโดยตรงจากการทดสอบจริงในเบราว์เซอร์ ไม่ใช่ Business Logic bug ในเอกสาร
// ประเภทใดเลย — Order/Invoice/TaxInvoice/BillingNote/RepairReturnNote ทั้ง 5 ประเภท
// มี validation logic ที่ถูกต้องและข้อความภาษาไทยที่ดีอยู่แล้วทุกจุด) ทางแก้ที่ถูกต้อง
// คือให้ Action คืนค่าแบบนี้แทนการ throw สำหรับ "Validation Error ที่คาดไว้แล้ว"
// (ผู้ใช้ควรเห็นเหตุผล) ส่วน error ที่ไม่คาดคิดจริงๆ (เช่น permission/DB down) ยัง throw
// ตามเดิมได้ตามปกติ — ไม่กระทบ Business Logic ใดๆ เปลี่ยนแค่วิธีส่งข้อความ error กลับ
export type ActionResult = { success: true } | { success: false; error: string };
