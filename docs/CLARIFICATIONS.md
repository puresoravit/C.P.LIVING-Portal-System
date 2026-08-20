# ข้อสรุปประเด็นที่เคยขัดกัน/ไม่ชัดเจน (เคลียร์แล้ว)

## Business Logic

1. **Special Price + Discount**: Special Price = ราคาตั้งต้นก่อนหักส่วนลด
   (ไม่ใช่ราคาสุทธิ) Discount % ของ Type หักออกจากราคาตั้งต้นนั้นตามปกติเสมอ
   ไม่มีการซ้อนทับแบบพิเศษ
2. **VAT-inclusive pricing**: ราคาทุกระดับรวม VAT แล้ว สูตรถอด VAT =
   ยอดรวม × 7 ÷ 107
3. **Rounding**: ทศนิยม 2 ตำแหน่ง, Round Half Up
4. **Tax Invoice ≠ 1:1 กับ Invoice เสมอไป**: ลูกค้าทั่วไปแจ้งรายการ/ยอด
   เองว่าจะออกใบกำกับภาษีเท่าไร (พนักงานเลือกเอง + reconcile) / ลูกค้า
   VAT 100% ใช้ auto-generate จากใบส่งของได้เลย — ต้องมี 2 โหมด

## Missing Fields (เพิ่มแล้ว/ต้องเพิ่มตอน Phase 4-5)

5. Place to Delivery — เพิ่มใน schema แล้ว (Invoice.placeToDelivery)
6. ทะเบียนรถ — กรอกมือตอนพิมพ์เท่านั้น ไม่เก็บ DB
7. Credit/Debit Note — future-ready ไม่ implement ใน V1

## Operational

8. Running Number รีเซ็ตทุกเดือน (ยืนยันแล้ว, ใช้ DocumentSequence table)
9. Credit Term: ตัวเลือก CASH/NET30/60/90 — ปัจจุบันลูกค้าทั้งหมดเป็น CASH
10. Billing Staff ยกเลิก Order/Invoice ของตัวเองได้เลย ไม่ต้องขอ Approve
11. Cancel Order: Block ถ้ามี Invoice ที่ยังไม่ Cancel ครบ — ไม่ Cascade
    อัตโนมัติ ต้อง Cancel Invoice ให้ครบก่อนถึง Cancel Order ได้
