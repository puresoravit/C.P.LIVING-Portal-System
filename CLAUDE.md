# CLAUDE.md — Bill System + โมดูล Production & Delivery

## บริบทโครงการ

Portal Application ของบริษัท C.P. Living ประกอบด้วย 2 โมดูลในแอปเดียวกัน ฐานข้อมูลเดียวกัน:

1. **Billing** — ระบบออกบิล/ใบกำกับภาษี **ทำเสร็จแล้ว ห้ามแก้ logic เดิม** (LIVE PRODUCTION: portal.cplivingmattress.com)
2. **Production & Delivery** — โมดูลใหม่ กำลังทำ P1: ติดตามออเดอร์ตั้งแต่รับ P.O. จนของขึ้นรถครบ

**Business logic แยกกันโดยสิ้นเชิง** — Product Master (`Product`/`ProductModel`/`ProductType`/`ProductCategory`) ใช้ร่วมกัน ห้ามทำสำเนา/ซิงก์

เอกสารสเปกอยู่ที่ `docs/production-module/` — อ่านตามลำดับ: `00-ส่งงาน.md` → `01-สรุปรวม.md` → **`02-P1-schema-decisions.md` (source of truth ล่าสุด แก้ทับจุดที่ 2 ไฟล์แรกยังไม่เห็นโค้ดจริงตอนร่าง)** → `03-future-direction-billing-integration.md` (context ระยะยาวเรื่องเชื่อม Billing — **ห้าม implement** จนกว่าจะอนุมัติแยก)

---

## กฎที่ต้องยึดตลอด — ห้ามฝ่าฝืน

### เรื่องขอบเขต

- **ห้ามแก้โค้ดหรือ logic ฝั่ง Billing** ที่ทำเสร็จแล้ว (ระบบ live จริง)
- **ห้ามทำสำเนา Product Master แล้วซิงก์** — ใช้ตาราง `products`/`product_models` เดิมร่วมกัน แค่เพิ่ม field ที่ขาด
- **ห้ามตั้งชื่อโมเดล Prisma ชนกับของเดิมหรือชนความหมายในอนาคต** — ก่อนเพิ่ม model ใหม่ต้อง `grep "^model <ชื่อ>"` เช็คก่อนเสมอ และคิดถึงความหมายมาตรฐานด้วย (มีบทเรียนจริง 2 ชั้น: (1) `Order`/`OrderItem` มีอยู่แล้วสำหรับ Billing — ห้ามใช้ชื่อ `Order*` ซ้ำ (2) ชื่อ `PurchaseOrder` แม้ไม่ชนกับโค้ดตอนนี้ แต่ชนความหมายมาตรฐาน ERP (procurement ขาออก) กับสิ่งที่โมดูลนี้ทำจริง (รับ P.O. จากลูกค้า) — ใช้ `CustomerPO*` แทน)
- **ห้ามทำระบบ Stock / Inventory** — อยู่นอกขอบเขต
- **ห้ามเพิ่ม Scope เอง** — เสนอพร้อมเหตุผลและผลกระทบ แล้วรออนุมัติ
- **ทำทีละระยะ** ตอนนี้อยู่ที่ **P1** เท่านั้น ห้ามทำ P2 ขึ้นไปล่วงหน้า

### เรื่อง Reuse — ก่อนสร้างของใหม่ ต้อง inspect ก่อนเสมอ

โปรเจกต์นี้มี pattern กลางที่ต้องนำมาใช้ซ้ำ ไม่ใช่คิดใหม่:

- Running number แบบ concurrency-safe → `src/lib/running-number.ts` (`getNextSeq`, `formatDocNumber`, `currentPeriod`)
- Lifetime counter ไม่รีเซ็ต (เช่นตัวนับต่อสาขา) → เลียนแบบ `src/lib/sku-sequence.ts` (`getNextSkuSeq` pattern)
- Permission matrix → `src/lib/permissions.ts` (`can(role, permission)`) — ห้ามกระจาย `if (role === ...)` ไปทั่วโค้ด
- Audit trail / Timeline → ต่อยอด `AuditLog` model เดิม (อย่าสร้างตาราง event ใหม่คู่ขนาน)
- Settings แบบ key-value → `AppSetting` model เดิม (`db.appSetting.upsert`)
- Family Head แบบ XOR (Product เดี่ยว หรือ ProductModel) → เลียนแบบ `resolveAccessHead()` ใน `src/lib/product-company-access.ts`
- แสดงผล "-N" ต่อท้ายเลขเอกสารเมื่อมี Rev → เลียนแบบ `displayQuotationNumber()` ได้ (แค่ suffix ตอนแสดงผล)
- **แต่การเก็บเนื้อหาแต่ละ Rev ห้ามเลียนแบบ `editConfirmedQuotation()`** (`deleteMany`+`createMany` items เก็บสรุปย่อใน AuditLog) — พิสูจน์แล้วว่าไม่พอ reconstruct/reprint เอกสารเต็ม ยอมรับได้เฉพาะ Quotation เพราะ "ไม่มี Downstream Document อ้างอิง" เอกสารที่ต้องสอบย้อนได้ (เช่น ProductionOrder) ต้องมีตาราง revision แยกจริง แถวใหม่ทุก Rev ไม่ update/delete ของเดิม (ดู `ProductionOrderRevision` ใน schema)

### เรื่อง Business Logic — 8 ข้อ

1. **ยอดไม่ต้องเท่ากัน** — ผลิต ≠ ขึ้นรถ ≠ ค้าง ได้โดยชอบธรรม ห้ามเขียน validation ว่า "ยอดไม่ตรง" ห้ามแก้ใบผลิตย้อนหลังให้ตรงกับที่ขึ้นจริง
2. **ห้ามตัดยอดให้เอง (ห้าม assume FIFO)** — คนเลือกเอง ระบบเสนอได้แต่ห้ามตัดสิน ต้องบันทึกว่าเลือกอะไร
3. **ห้ามเขียนทับประวัติ** — ลูกค้าแก้ออเดอร์กี่ครั้งเก็บทุกครั้ง (`CustomerPORevision` + `AuditLog`)
4. **ของค้างแยกใบใหม่เสมอ** — ปิดใบเดิม สร้างใบใหม่ด้วยจำนวนที่เหลือ ห้ามแก้ตัวเลขในใบเดิม
5. **หลักฐานมาก่อนตัวเลข** — กระทบยอดไม่ได้ถ้ายังไม่แนบรูปใบขึ้นของที่ขีดนับแล้ว
6. **แก้หลังพิมพ์ = บันทึกลงระบบเสมอ แต่ไม่บังคับพิมพ์ใหม่** *(Owner แก้กฎ 2026-08-29 — แทนกฎเดิม "ต้องพิมพ์ใหม่ครบทุกชุด")* — หน้างานจริง Owner โทรบอกพนักงานแล้วแก้กระดาษชุดเดิมด้วยปากกา ระบบต้องเก็บ digital history ครบ (CustomerPO Revision + Production Revision) ให้ยอดปัจจุบันใน CustomerPO ถูกต้องเสมอ (P2/ใบขึ้นของอนาคตอ่านจากตรงนี้) + เตือนบนใบสั่งผลิตว่า P.O. ต้นทางถูกแก้หลังออกใบ — การพิมพ์ Revision ใหม่เป็น optional ห้ามทำเป็นเงื่อนไขบังคับใน workflow
7. **ตัดของค้างต้องอนุมัติ** — หัวหน้า/ผู้ดูแลระบบเท่านั้น ห้าม Hard Delete
8. **ตอบว่า "ไม่รู้" ได้** *(P5 — AI อ่านลายมือ)* — ไม่รู้แต่แกล้งทำเป็นรู้เท่านั้นที่ผิด

### สามเรื่องที่ต้องเข้าใจก่อนออกแบบ Schema

1. `spec_hash` คำนวณจาก รุ่น(productId)+กุ๊น+ความหนา+ผ้าตามตำแหน่งจริงของ Production Spec+ทุกชั้นโครงสร้าง — **ตำแหน่งผ้าไม่ตายตัวที่ 3 ตำแหน่ง** (มี WHOLE/TOP/BOTTOM/SIDE/HEAD_TAIL และอื่นๆ ตาม master data จริง แต่ละตำแหน่งมีได้มากกว่า 1 ผ้าด้วย เช่น ผ้าปีกสูงสุด 2 ผ้า — แก้ 2026-08-28 หลัง Owner ส่ง Production Spec ตัวอย่างจริง ดู `docs/production-module/02-P1-schema-decisions.md`) เก็บเป็น JSON/ตารางลูกมีโครงสร้าง ห้ามเก็บเป็น text ก้อนเดียว การ override การแสดงผล (`displayOverride`) **ห้ามกระทบค่า hash** ไซส์ที่ตัดไม่เข้า hash (สูตรเดียวกันใช้ข้ามไซส์ได้)
2. ผ้าจัดบรรทัดอัตโนมัติ สูงสุด 2 บรรทัด — ขา/ล้อ/อุปกรณ์อื่นลงหมายเหตุ ไม่ใช่ช่องผ้า
3. `AuditLog` เก็บ `customerId`/`branchId`/`customerPoId` ทุกแถวที่เกี่ยวข้อง แม้หาย้อนได้จาก entity เพราะหน้าประวัติเปิดบ่อยที่สุด

### UI — Mobile-first เฉพาะหน้าปฏิบัติงาน

หน้าจอที่พนักงานใช้หน้างาน (สร้าง/แก้ออเดอร์, ยืนยันรายการ) ออกแบบ mobile-first (card-list ไม่ใช่ตารางแน่น, ปุ่มใหญ่, พิมพ์น้อยที่สุด) — **แยกเทมเพลตจากฟอร์มพิมพ์ A4** ซึ่งจัดตามสเปกกระดาษเดิมเสมอ ไม่ปนกัน

### ค่าที่ห้าม Hardcode

ไซส์ที่ผลิตได้ · ชื่อแผนกและจำนวนชุดที่พิมพ์ · ชื่อภาค/ปลายทาง · เกณฑ์อายุของค้าง · รูปแบบเลขที่เอกสาร — เก็บผ่าน `AppSetting` ทั้งหมด

---

## ขั้นตอนก่อนลงมือเขียนโค้ด

1. อ่านเอกสารสเปกให้ครบ (`docs/production-module/`)
2. สรุปความเข้าใจกลับมาให้เจ้าของตรวจ
3. ระบุจุดที่ยังไม่ชัดหรือขัดกัน — **inspect codebase จริงก่อนเสนอ schema ทุกครั้ง** อย่าเดา
4-7. เสนอ Schema / API / Screen Flow / แผนงาน
8. ระบุคำถามที่ต้องได้คำตอบก่อนเริ่ม

**รอ Approval จากเจ้าของก่อนเขียนโค้ดจริงเสมอ**

---

## สถานะปัจจุบัน

- **ระยะที่ทำอยู่:** P1 — โครงกระดูก (คีย์มือล้วน ยังไม่มี AI) — Schema Foundation อนุมัติแล้ว กำลัง implement
- **Role:** ใช้ 3 Role เดิมของ Billing ไปก่อน (OWNER_ADMIN/BILLING_STAFF/VIEWER) — ยังไม่แยก Role ใหม่ให้ Production
- **ยังไม่ทำ:** P2 การส่งของ · P5 AI อ่านลายมือ · P6 เชื่อม Billing
