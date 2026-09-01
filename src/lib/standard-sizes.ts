// R6 Phase B — ตารางค่าคงที่ Standard Size สำหรับ Category usesSize=true (เช่นฟูกที่นอน)
// เป็น Single Source of Truth ตัวเดียวของทั้งระบบ (ProductModel Form ตอนสร้าง Variant
// และ /api/products/search ตอนแสดง Size ที่คีย์เอกสารได้ ใช้ตารางนี้ร่วมกัน) ค่าตัวเลข
// (value) ใช้คำนวณราคาเท่านั้น — ไม่เคย Parse จาก String ที่ไหนเลยตามที่อนุมัติ
//
// Owner UAT (2026-09-02) — แยกไฟล์ออกมาจาก product-variant-size.ts (ซึ่ง import db/Prisma
// ใช้ได้เฉพาะฝั่ง Server) เพราะ product-line-sort.ts (Stable Product Ordering) ต้องใช้
// ตารางนี้จาก Client Component (Edit Modal) ด้วย — product-variant-size.ts ยัง Re-export
// ให้ผู้ใช้เดิมทุกจุด Import จากที่เดิมได้เหมือนเดิมทุกประการ (ยังเป็น SSOT ตัวเดียว)
export const STANDARD_MATTRESS_SIZES: { label: string; value: number }[] = [
  { label: "3 ฟุต", value: 3 },
  { label: "3.5 ฟุต", value: 3.5 },
  { label: "4 ฟุต", value: 4 },
  { label: "5 ฟุต", value: 5 },
  { label: "6 ฟุต", value: 6 },
];

export const CUSTOM_SIZE_LABEL = "ขนาดพิเศษ/ระบุเอง";
