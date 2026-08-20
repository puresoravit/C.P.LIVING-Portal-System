/**
 * แปลง object เป็น JSON string ที่ปลอดภัยสำหรับฝังใน <script> tag ผ่าน
 * dangerouslySetInnerHTML — ป้องกันกรณีข้อมูล (เช่น ชื่อลูกค้า/สาขาที่พิมพ์
 * เข้ามา) มีข้อความ "</script>" ปนอยู่ ซึ่งจะ "แหก" ออกจาก script tag
 * แล้วแทรก HTML/JS อื่นได้ (Stored XSS — ข้อ 51 Security)
 *
 * JSON.stringify ธรรมดาไม่ escape เครื่องหมาย "<" จึงต้อง escape เพิ่มเอง
 */
export function safeJsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
