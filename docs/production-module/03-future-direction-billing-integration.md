# Future Direction — เชื่อม Billing (Context เท่านั้น ห้าม Implement ใน P1/P2)

> เอกสารนี้บันทึก **เจตนาระยะยาว** ไว้เป็น architectural context สำหรับการตัดสินใจ
> ออกแบบ schema ใน P1/P2 เท่านั้น — **ไม่ใช่สเปกที่ต้องสร้างตอนนี้** ห้ามเริ่มทำ AI,
> Billing integration, automatic delivery note หรือแก้ Billing workflow ใดๆ จนกว่าจะมี
> การอนุมัติแยกต่างหากในอนาคต

## เป้าหมายระยะยาว (ตามที่เจ้าของวางไว้)

หลัง Production & Delivery workflow ใช้งานจริงและนิ่งแล้ว (ผ่าน P4):

1. ผล **Loading Reconcile / Actual Loaded ที่ยืนยันแล้ว** (ของ P2) เป็น source สร้าง
   "ใบส่งของชั่วคราว" ใน Billing อัตโนมัติ
2. ต่อมา (ไกลกว่านั้นอีก) AI อ่านรูปใบขึ้นของที่ขีดแล้ว เทียบกับ Customer P.O. /
   outstanding / new order / loading additions แล้วเสนอผล reconcile ลดการคีย์ซ้ำ —
   ต้องมี**คนยืนยัน**ก่อนส่ง confirmed result ไป Billing เสมอ (ตรงหลักการเดียวกับ P5)

**หลักการที่ต้องคงไว้ตลอด:** Production & Delivery เป็นเจ้าของ **operational truth**
ของการขึ้นของ · Billing เป็นแค่ **downstream consumer** ของผลที่ confirm แล้วเท่านั้น ·
**ห้ามให้ AI หรือรูปดิบเขียนเข้า Billing โดยตรงเด็ดขาด** ต้องผ่านคนยืนยันก่อนทุกครั้ง

## ผลตรวจสถาปัตยกรรมปัจจุบัน (P1) — ไม่ปิดทาง

ตรวจ codebase จริงแล้ว (2026-08-28) สรุปได้ว่า **ไม่มีจุดใดใน P1 ที่ปิดทางลด flow นี้**:

1. **ไม่มี coupling ข้ามโมดูลอยู่เลยตอนนี้** — `CustomerPO`/`ProductionOrder`/
   `ProductionItem` ไม่มี FK ไปหา `Order`/`Invoice`/`InvoiceItem` ของ Billing เลยสักจุด
   (grep ยืนยันแล้ว) และย้อนกลับก็เช่นกัน — ตรงกับหลัก "Billing เป็น downstream
   consumer เท่านั้น" อยู่แล้วโดยธรรมชาติ เพราะยังไม่มีใครเขียนหาใคร
2. **"ใบส่งของ" ใน Billing ไม่ใช่ model แยก — คือ `Invoice` model เดิม** (มี
   `printedAt`/`status` เป็นตัวบอกว่าพิมพ์เป็น "ใบส่งของ" แล้วหรือยัง ก่อนออก
   `TaxInvoice`) — จุดที่ต้องรู้ไว้: `Invoice.parentOrderId` เป็น **required FK** ไปหา
   Billing `Order` เสมอ (schema.prisma:558) **บันทึกไว้เป็น architectural
   constraint/open decision เท่านั้น** — ยังไม่ตัดสินล่วงหน้าว่าจะทำเป็น nullable
   หรือสร้าง Order สังเคราะห์ก่อน วันที่ทำ P6 จริงต้อง inspect Billing workflow
   ปัจจุบันอีกครั้งแล้วเลือกวิธีที่รักษา invariant เดิมของ Billing ได้ดีที่สุด
   (เป็นงานฝั่ง Billing เท่านั้น ไม่กระทบ Production ปัจจุบันเลย)
3. **`AuditLog` ที่ต่อยอดไว้ตอน P1 (`correlationId`/`customerId`/`branchId`/
   `customerPoId`) เป็น trace/audit mechanism ที่ช่วยเชื่อมเหตุการณ์ข้ามโมดูลได้** —
   **ไม่ใช่ integration contract หลักของ P6** วันที่ทำ integration จริงต้องออกแบบ
   explicit integration reference/idempotency ต่างหากตาม workflow จริงตอนนั้น
   (เช่น รู้ว่า Loading Reconcile ไหนสร้าง Billing document ไหน กันสร้างซ้ำ
   และรองรับ retry/failure ได้) — `correlationId` ช่วยเรื่อง trace/debug แต่ไม่ได้
   ออกแบบมาเพื่อรับประกัน idempotency หรือ retry semantics ของ production integration
4. **รูปดิบ/หลักฐานยังเป็นของ Production เท่านั้น** — `poImagePaths` อยู่บน
   `CustomerPO` (ตาราง Production เอง) ไม่มีจุดไหนให้ Billing อ่านรูปโดยตรง
5. เอกสารสเปก P5 เดิม (`docs/production-module/` ที่ Co-worker ส่งมา) เขียนหลักการ
   เดียวกันนี้ไว้แล้ว: "การยิงต่อเข้า Sales Order... ให้ทำเป็นการส่งข้อมูลข้ามระบบผ่าน
   จุดเชื่อมที่ระบุชัด ไม่ใช่การเรียกฟังก์ชันข้ามโมดูล" — Future Direction นี้สอดคล้องกับ
   ที่วางไว้เดิมทุกประการ ไม่ขัดกัน

## สิ่งที่ต้องคงไว้ตอนออกแบบ P2 (ยังไม่ implement — แค่จำไว้ตอนถึงเวลาจริง)

- ตาราง Loading/Outstanding ของ P2 (ยังไม่สร้าง) ต้องคง FK chain สะอาดกลับไปหา
  `CustomerPO` → `CustomerPOLine` → `ProductionItem` (เหมือนที่ `ProductionItem`
  ผูกกับ `CustomerPOLine` อยู่แล้วตอนนี้)
- Action "กระทบยอด/reconcile" ของ P2 ควรสร้าง identifier ที่ stable ต่อผลการ confirm
  แต่ละครั้ง (เผื่อใช้อ้างอิงได้ทีหลัง) — ส่วนกลไก reference/idempotency ที่ integration
  จริงต้องใช้ (กันสร้างซ้ำ, รองรับ retry/failure) ให้ออกแบบตอนถึง P6 จริงตาม workflow
  ที่เกิดขึ้นจริงตอนนั้น ไม่ผูกไว้ล่วงหน้าว่าต้องใช้ `correlationId` เป็นกลไกหลัก
- รูปถ่าย/หลักฐานยังคงเก็บฝั่ง Production เท่านั้นเสมอ ไม่ส่งต่อให้ Billing โดยตรง
- ถ้าวันหน้าทำ integration จริง ให้ทำเป็น**จุดเชื่อมชัดเจนแยกต่างหาก** (เช่น service
  function เดียวที่รับ "confirmed result" แล้วเรียก Billing's create-Invoice logic
  เอง) ไม่ใช่ Production เขียนตรงเข้า Billing tables หรือ Billing query ตรงเข้า
  Production tables
