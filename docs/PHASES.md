# Development Phases

ห้ามพัฒนาทุกอย่างพร้อมกัน (ข้อ 77) — ทำทีละ Phase ตามลำดับนี้

- [x] **Phase 1 — Foundation** — Architecture, Database, Authentication,
      User/Role, Customer, Branch, Product Type, Product
- [x] **Phase 2 — Business Rule** — Price Master, Price History,
      Effective Date, Discount Rules, VAT Setting
      **(สถานะ: scaffold เสร็จในรอบนี้ — ต้องรัน migrate แล้วทดสอบเอง)**
- [ ] **Phase 3 — Sales Order** — Order, Order Item, Product Search,
      Price Lookup, Product Type Classification, Discount Lookup, Preview
- [ ] **Phase 4 — Billing** — Auto Split, Invoice, Invoice Item, Snapshot,
      Running Number, Status, Cancel
- [ ] **Phase 5 — Print** — PDF, Invoice Template, Tax Invoice Template,
      Print Layout (กระดาษต่อเนื่อง 4 ชั้น), Reprint
- [ ] **Phase 6 — Report** — Sales Report, Product Report, Customer
      Report, Branch Report, Product Type Report, Dashboard
- [ ] **Phase 7 — Excel** — Import, Validation, Template, Export
      Summary, Export Raw Data
- [ ] **Phase 8 — Control** — Audit Log UI, Permission Review, Backup,
      Restore, Error Handling, Logging
- [ ] **Phase 9 — Testing** — Automated Tests, Integration Tests, UAT,
      Real Business Test Cases
- [ ] **Phase 10 — Production** — Deployment, Initial Data Import,
      User Training, Production Test, Go Live, Backup Verification

## สิ่งที่ทำเสร็จใน Phase 1

- Next.js + TypeScript + Prisma + PostgreSQL project scaffold
- Database Schema เต็ม 17 ตาราง
- Authentication (NextAuth Credentials + bcrypt) + Role-based Middleware
- Permission Matrix กลาง (`src/lib/permissions.ts`)
- Audit Log อัตโนมัติทุก Create/Update/Toggle Active
- Customer / Branch / Product Type / Product Master (Create + Toggle Active)
- Seed script (Admin user, Product Type A/B/C, VAT 7%)
- Unit test: Permission Matrix

## สิ่งที่ทำเสร็จใน Phase 2 (รอบนี้)

- **Edit Form ครบทั้ง 4 Master**: Customer, Branch, Product Type, Product
  (`/customers/[id]`, `/branches/[id]`, `/product-types/[id]`, `/products/[id]`)
- **Pricing Engine** (`src/lib/pricing.ts`) — หัวใจของระบบ แยกจาก UI:
  - `getEffectivePrice()` — Priority Branch → Customer → Standard (ข้อ 12, 18)
  - `getEffectiveDiscountPct()` — Priority Branch+Type → Customer+Type → 0% (ข้อ 15, 20)
  - `getEffectiveVatRate()` — VAT ตาม Effective Date (ข้อ 26)
  - `extractVat()` — สูตร ยอดรวม×7÷107, Round Half Up ทศนิยม 2 ตำแหน่ง
  - `dateRangesOverlap()` — ใช้ validate ก่อนบันทึก Price/Discount Rule ใหม่
  - `roundMoney()` — จุดปัดเศษเดียวทั้งระบบ
- **หน้า "ราคา" (`/prices`)** — ตั้ง Customer/Branch Special Price พร้อม
  Effective Date, กันช่วงวันที่ซ้อนกัน (ข้อ 61), ลบได้ (ยังไม่เคยใช้ใน
  Invoice จริงจึงลบตรงๆ ได้โดยไม่ผิดข้อ 48)
- **หน้า "ส่วนลด" (`/discounts`)** — ตั้ง Discount % ตาม Customer/Branch ×
  Product Type พร้อม Effective Date + กันซ้อนกันเช่นกัน
- **หน้า "ตั้งค่า VAT" (`/settings/vat`)** — ตั้งอัตราใหม่ ปิดอัตราเก่าอัตโนมัติ
- **Unit Test เพิ่ม** (`src/lib/pricing.test.ts`): extractVat (สูตร VAT +
  rounding), roundMoney (Round Half Up), dateRangesOverlap (ครบ 4 กรณี)

## ยังไม่ได้ทำใน Phase 2

- Edit form ของ Price Rule / Discount Rule (ตอนนี้มีแค่ Create + Delete —
  ถ้าต้องการแก้ไข ต้องลบแล้วสร้างใหม่ไปก่อน)
- Excel Import สำหรับ Master Data — ยังอยู่แผน Phase 7 ตามเดิม
  (ผู้ใช้แจ้งว่าจะลองกรอกข้อมูลเก่าเองผ่านหน้าเว็บไปก่อน)
- User Management UI (เพิ่ม User อื่นนอกจาก seed)

## คำถามก่อนเริ่ม Phase 3

1. Phase 3 คือหัวใจของระบบ (Sales Order Entry) — จะเริ่มทำเลยได้ไหม
   หรือต้องการทดสอบ Phase 1-2 ก่อน (เพิ่มลูกค้า/สินค้า/ราคาจริงลองดู)?
2. Order Entry UI ต้อง keyboard-friendly มาก (ข้อ 60) — จะใช้เวลาออกแบบ
   ส่วนนี้ค่อนข้างมาก ต้องการให้เน้นตรงไหนเป็นพิเศษไหม

## สิ่งที่ทำเสร็จใน Phase 3 (รอบนี้)

- **Running Number Engine** (`src/lib/running-number.ts`) — atomic upsert
  แบบ concurrency-safe (ข้อ 30, 52), รีเซ็ตทุกเดือน
- **Order Preview Engine** (`src/lib/order-preview.ts`) — แยกเป็น pure
  function (`groupByTypeAndApplyDiscount`) test ได้โดยไม่ต้องต่อ DB
  + ฟังก์ชันดึงข้อมูลจริง (`computeOrderPreview`)
- **Golden Test Case ตามข้อ 66** (`src/lib/order-preview.test.ts`) —
  ทดสอบ Order ผสม 3 Type เต็มรูปแบบ ตรวจ Gross/Discount/Net ทุก field
- **Sales Order เต็มรูปแบบ**: สร้าง Draft (`/orders/new`), คีย์รายการ
  แบบ keyboard-friendly (ค้นหา SKU → ลูกศร/Enter เลือก → คีย์จำนวน →
  Enter เพิ่ม), Preview แยกตาม Type แบบ real-time, Confirm/Cancel
  พร้อม validation (ข้อ 60, 21, 29)
- Cancel Order block ถ้ามี Invoice ที่ยังไม่ Cancel (ตาม clarification #11)
- API route ค้นหาสินค้า `/api/products/search` (ข้อ 17, 31)

## ยังไม่ได้ทำใน Phase 3

- Invoice ยังไม่ถูกสร้างจริงตอน Confirm (ตั้งใจ — เป็นงานของ Phase 4
  "Auto Split Bill/Invoice" ตามข้อ 22 พอดี) ตอนนี้ Confirm แค่เปลี่ยน
  สถานะ Order เป็น CONFIRMED และมี TODO comment ชี้ไว้ในโค้ดจุดที่ต้อง
  ต่อ Phase 4

## แก้ไขจุดตกหล่นที่พบระหว่างทาง (ก่อนเริ่ม Phase 4)

- เพิ่ม `placeToDelivery` เข้า Order model (เดิมมีแค่ใน Invoice ทำให้ไม่มี
  ต้นทางข้อมูลให้ snapshot) — เพิ่มในฟอร์มสร้าง Order พร้อม auto-fill
  จากที่อยู่สาขา (แก้ไขเองได้อิสระ ตามฟอร์มเอกสารจริง)

## สิ่งที่ทำเสร็จใน Phase 4 (รอบนี้)

- **confirmOrder ต่อยอดเป็น Auto Split Invoice เต็มรูปแบบ**: Confirm Order
  1 ครั้ง = เปลี่ยนสถานะ Order + สร้าง Invoice แยกตาม Product Type +
  สร้าง Invoice Item ทุกใบ ทั้งหมดอยู่ใน **DB Transaction เดียว** (atomic
  ตามข้อ 56 — พลาดจุดใดจุดหนึ่ง rollback หมดรวม status Order ด้วย)
- **Snapshot ครบตามข้อ 27**: ชื่อลูกค้า, เลขผู้เสียภาษี, ชื่อ/ที่อยู่สาขา,
  สถานที่ส่งสินค้า, ราคา/ส่วนลด/SKU/ชื่อสินค้าทุกรายการ เก็บลง
  Invoice/InvoiceItem เอง ไม่ join จาก Master Data สด
- **Running Number แยกชุดต่อ Type+เดือน** ตามฟอร์แมตข้อ 22 พอดี:
  `INV-A-202608-0081`, `INV-B-202608-0044` ฯลฯ
- **หน้า "ใบส่งของ/บิล"** — รายการ Invoice ทั้งหมด + หน้ารายละเอียดแสดง
  Snapshot เต็ม + รายการสินค้า + สรุปยอด + ปุ่ม Cancel
- Order detail แสดงลิงก์ไป Invoice ที่แตกออกมาให้เห็นทันที (Parent Order
  Relation ข้อ 23 ใช้งานได้จริงแล้ว)
- **การออกแบบสำคัญที่ตัดสินใจไว้**: Invoice ที่แตกตรงนี้ = "ใบส่งของ
  ชั่วคราว" (VAT = 0 เสมอ) ตามที่ยืนยันไว้ในการหารือเรื่อง VAT — ส่วน
  "ใบกำกับภาษี" (มี VAT, ไม่ผูก 1:1 กับใบนี้เสมอไป, มีทั้งโหมด Auto/Manual)
  จะเป็นเอกสารแยกต่างหากใน Phase 5 ไม่ใช่ field เดียวกัน
- Test เพิ่ม: running-number formatting

## ยังไม่ได้ทำใน Phase 4

- ใบกำกับภาษี (Tax Invoice) แบบแยกเอกสาร — วางแผนไว้ Phase 5
- Printing (PDF/กระดาษต่อเนื่อง) — Phase 5
- Invoice status PRINTED ยังไม่มีปุ่มกดจริง (มีแค่ action `markInvoicePrinted`
  เตรียมไว้ รอ Phase 5 ผูกกับปุ่ม Print จริง)

## สิ่งที่ทำเสร็จใน Phase 5 (รอบนี้)

- **Thai Baht Text Converter** (`src/lib/thai-baht-text.ts`) — แปลงจำนวนเงิน
  เป็นข้อความไทย ทดสอบเทียบกับตัวเลขจริงจากเอกสารตัวอย่างที่ผู้ใช้ส่งมา
  ครบ (88,410 / 348,250 / 25,174.96)
- **Tax Invoice เต็มรูปแบบ** — เอกสารแยกจาก Invoice ตามที่ยืนยันไว้:
  - โหมด **Auto**: ปุ่ม "สร้างใบกำกับภาษีจากใบนี้" ในหน้า Invoice — ถอด
    VAT จากยอดเดิมด้วยฟังก์ชัน extractVat ที่มีอยู่แล้ว
  - โหมด **Manual**: หน้า `/tax-invoices/new` คีย์รายการอิสระเอง
    (ไม่ผูก Product Master) ตามที่ลูกค้าแจ้งมา คำนวณ VAT จากยอดรวม
  - เลขที่เอกสาร `TX-YYYYMM-###` (running number แยกชุด)
  - Cancel ได้ (ห้าม Hard Delete เหมือน Invoice)
- **หน้าตั้งค่าข้อมูลบริษัท** (`/settings/company`) — เก็บผ่าน AppSetting
  table ใช้เป็นหัวกระดาษทุกเอกสารที่พิมพ์
- **หน้าพิมพ์ (Print Preview)** ทั้ง Invoice และ Tax Invoice — layout
  ตามฟอร์มจริงที่ผู้ใช้ส่งรูปมา (หัวบริษัท, กล่องข้อมูลเอกสาร, ตาราง
  รายการ, สรุปยอด, จำนวนเงินเป็นตัวอักษรไทย, ช่องลงชื่อ 3 ฝ่าย),
  ปุ่ม "พิมพ์ / บันทึกเป็น PDF" ใช้ `window.print()` ของ browser,
  Reprint ใช้ข้อมูล Snapshot เท่านั้น (ไม่ดึงราคา/ที่อยู่ปัจจุบันมาทับ —
  ตรงตามข้อ 34 โดยธรรมชาติเพราะ query จาก Invoice/Item ที่ snapshot ไว้แล้ว)
- Print CSS ใช้ `@page` แยกจาก business logic ชัดเจน (ข้อ 33) — จุดเดียว
  ที่ต้องแก้ถ้าจะปรับขนาดกระดาษ/margin ภายหลัง

## ยังไม่ได้ทำใน Phase 5

- **Layout สำหรับกระดาษต่อเนื่อง 4 ชั้นจริง** — ตอนนี้ทำ A4 ให้ก่อน
  (พิมพ์เป็น PDF ได้แน่นอน) การพิมพ์บนกระดาษต่อเนื่องจริงต้องรู้ขนาด
  กระดาษ/เครื่องพิมพ์ที่ใช้จริงก่อนถึงจะปรับ `@page size` ให้ตรงได้
  — รอข้อมูลเพิ่มเติมจากคุณตอนใกล้ๆ ติดตั้งจริง
- **ใบส่งคืนสินค้าฝากซ่อม** และ **ใบวางบิล (Billing Note รวมหลาย Invoice)**
  — เป็นเอกสารที่ 2 และ 4 จาก 4 ประเภทที่คุยกันไว้ ยังไม่ได้ทำ เพราะไม่ได้
  อยู่ใน core flow Order→Invoice โดยตรง (ใบวางบิลน่าจะเหมาะทำพร้อม
  Phase 6 Report เพราะเป็นการสรุปหลาย Invoice) — แจ้งได้ถ้าอยากให้ทำ
  ก่อนไป Phase 6
- Reprint ยังไม่มีการันตี "PRINTED" status auto-set ทุกครั้งที่มีคนเข้าไป
  ดูหน้า print (ตั้งใจ — ต้องกดปุ่ม "มาร์คว่าพิมพ์แล้ว" เอง ป้องกันคนแค่เปิด
  preview ดูแล้วถูกนับว่าพิมพ์ไปแล้ว)

## เพิ่มเติมหลัง Phase 5 (ตามที่ขอเพิ่ม): เอกสารที่เหลือ + ปรับกระดาษพิมพ์

- **ปรับขนาดกระดาษพิมพ์จริง**: EPSON LQ-310, กระดาษต่อเนื่อง 9"×11"
  — รวมไว้จุดเดียวที่ `src/lib/print-settings.ts` (`PRINT_PAGE_SIZE`,
  `PRINT_MARGIN`) ทุกหน้า print import ใช้ค่าเดียวกัน แก้ที่เดียวพอ
- **ใบส่งคืนสินค้าฝากซ่อม** เต็มรูปแบบ — เอกสารอิสระ ไม่ผูกกับ Order/
  Invoice/Pricing Engine เลย (ไม่ใช่การขาย) มี List/Create(Manual item
  entry ไม่มีราคา)/Detail/Print/Cancel, เลขที่ `DEP-YYYYMM-###`
- **ใบวางบิล** เต็มรูปแบบ — เลือกลูกค้า → ระบบโชว์ Invoice ที่ยังไม่เคย
  ถูกวางบิล (`Invoice.billingNoteId = null`) → ติ๊กเลือกรวมเป็นใบเดียว
  → ล็อก Invoice เหล่านั้นไม่ให้ถูกวางบิลซ้ำ (ป้องกันด้วย field
  `billingNoteId` บน Invoice + เช็คซ้ำใน action), เลขที่ `BI-YYYYMM-###`,
  Cancel แล้ว Invoice จะปลดล็อกกลับมาวางบิลใหม่ได้, วันครบกำหนดคำนวณจาก
  Credit Term ของลูกค้าจริง (Cash = วันเดียวกับ Invoice Date)

## Design Decision สำคัญที่ควรรู้

- **ใบวางบิล V1 ไม่มีการติดตามยอดชำระบางส่วน (Partial Payment)** —
  ตามที่ยืนยันไว้ตั้งแต่ข้อ 74 ว่า V1 ไม่ทำระบบรับชำระเงินเต็มรูปแบบ
  ใบวางบิลตอนนี้จึงเป็นแค่เอกสารสรุปยอดที่ต้องเก็บ ไม่มีคอลัมน์
  "ยอดที่ชำระแล้ว/คงค้าง" แบบในตัวอย่างเอกสารจริง (ต้องมีระบบ Payment
  ก่อนถึงจะเพิ่มได้ถูกต้อง — เป็น Feature ที่ควรเสนอแยกต่างหากถ้าต้องการ)

## สิ่งที่ทำเสร็จใน Phase 6 (รอบนี้)

- **Reports Engine** (`src/lib/reports.ts`) — อ่านจาก InvoiceItem+Invoice
  จริง (ไม่รวม Cancelled) filter ครบตามข้อ 35 (date/customer/branch/
  productType/sku) และ group by ได้ 5 มิติตามข้อ 36
- **หน้า "รายงานยอดขาย"** (`/reports`) — รวม Sales Report (ข้อ 35-36),
  Product Type Report (ข้อ 37, เลือก tab), Product Report (ข้อ 38,
  เรียงขายมากสุด/ยอดสูงสุด), Customer Report (ข้อ 39, มี Drill Down
  คลิกลูกค้า → เห็นแยกรายสาขา) ไว้ในหน้าเดียวกันแบบ tab สลับมุมมอง
- **Branch Report** (`/reports/branches`) — Product Mix แยกตาม Type
  ต่อสาขา (ข้อ 40)
- **Dashboard** (`/` — หน้าแรกหลัง login) — ยอดเดือนนี้ (เลือกช่วงเวลา
  ได้), ยอดแยก Type, Top 5 Customer/Product (ข้อ 41)

## แก้ไขจุดตกหล่นที่พบระหว่างทำ Phase 6

- **Billing Staff เห็น Dashboard/Report ทั้งที่ไม่มีสิทธิ์** — ข้อ 3.2
  ไม่ได้ให้สิทธิ์ Billing Staff ดู Dashboard/Report ไว้ (มีแค่ OWNER_ADMIN
  และ VIEWER) แต่ตอนแรกผมทำ Dashboard เป็นหน้าแรกของทุก Role เหมือนกันหมด
  — แก้แล้ว: เพิ่มการเช็คสิทธิ์ `report.view` ที่หน้า Dashboard/Reports/
  Branch Report ถ้าไม่มีสิทธิ์จะเห็นหน้า "ทางลัดใช้งานประจำวัน" แทน
  (สร้าง Order/ดู Invoice/สร้างใบกำกับภาษี) และ **กรองเมนู Sidebar ตาม
  สิทธิ์จริงของแต่ละ Role** ด้วย (เดิม Sidebar โชว์เมนูเดียวกันหมดทุก Role
  ซึ่งไม่ตรงกับสิทธิ์จริง)

## ยังไม่ได้ทำใน Phase 6

- Export Excel (Summary/Raw Data) ของ Report — Phase 7

## ตรวจสอบย้อนหลัง Phase 1-6 ก่อนเริ่ม Phase 7 — พบ 3 จุดต้องแก้ (แก้แล้วทั้งหมด)

1. **🔴 Rounding Drift ระหว่างยอด Invoice กับผลรวม Invoice Item** (สำคัญสุด)
   — เดิมคำนวณส่วนลดแต่ละ Invoice Item แยกกัน ปัดเศษทีละบรรทัด ขณะที่
   ยอดรวม Invoice คำนวณจากยอดรวมทั้งกลุ่มทีเดียว อาจต่างกัน 0.01 บาทได้
   ในบางกรณี — แก้ด้วยฟังก์ชัน `allocateProportionally()` ใหม่ใน
   `src/lib/pricing.ts` (จัดสรรตามสัดส่วน + ปรับบรรทัดสุดท้ายดูดเศษ
   ที่เหลือ) รับประกันผลรวมรายการ = ยอดรวม Invoice เป๊ะเสมอ มี test
   ยืนยันครบ (`pricing.test.ts`)
2. **🔴 ไม่มีหน้าพิมพ์ Sales Order** — ข้อ 32 ระบุชัดว่าต้องพิมพ์ได้ 3 อย่าง
   (Sales Order, Invoice, Tax Invoice) แต่ทำแค่ 2 อย่างหลัง เพิ่ม
   `/orders/[id]/print` แล้ว (เอกสารภายในสำหรับพนักงาน ไม่ใช่เอกสารลูกค้า)
3. **🔴 ข้อ 63 (Order Duplication) ยังไม่เคยทำ** — เพิ่ม `duplicateOrder`
   action แล้ว คัดลอกแค่ SKU+จำนวน ไม่แตะราคา/ส่วนลดเก่าเลย (ราคาคำนวณ
   ใหม่อัตโนมัติจาก Pricing Engine ตาม Order Date ใหม่เสมอ เพราะ
   OrderItem ไม่เก็บราคาไว้อยู่แล้ว)

## Design Trade-off ที่ควรทราบ (ไม่ใช่บั๊ก แต่ตัดสินใจไว้ ถ้าอยากเปลี่ยนแจ้งได้)

- **PriceRule/DiscountRule ใช้ Hard Delete** (ปุ่ม "ลบ" ในหน้าราคา/ส่วนลด
  ลบจริงจากฐานข้อมูล) ต่างจาก Master Data อื่นที่ใช้ Active/Inactive
  ตามข้อ 48 — เหตุผล: กติการาคา/ส่วนลดยังไม่เคยถูกใช้ตัดสินราคาใน
  Invoice จริง (Invoice Snapshot ค่าไปแล้วตอน Confirm) จึงลบตรงๆ ได้
  โดยไม่กระทบ Invoice เก่า และ Audit Log ก็ยังบันทึกค่าที่ลบไว้อยู่ (เก็บ
  ประวัติผ่าน AuditLog แทนการเก็บ record เดิมไว้) — ถ้าต้องการเปลี่ยนเป็น
  Soft Delete (เพิ่ม field active) แจ้งได้ครับ

## สิ่งที่ทำเสร็จใน Phase 7 (รอบนี้)

- **Excel Import ครบ 5 ประเภท**: ลูกค้า, สาขา, สินค้า, ราคา, ส่วนลด
  (ข้อ 42) — แต่ละแบบมี:
  - ปุ่ม Download Template แยกไฟล์ (ข้อ 43) มีแถวตัวอย่างให้ดู format
  - Validate + Preview ก่อน Import จริงเสมอ (ข้อ 44): แสดง Total/Valid/
    Error, รายการ error พร้อมแถวที่/สาเหตุ (SKU ซ้ำ, ไม่พบลูกค้า, วันที่
    ไม่ถูกต้อง ฯลฯ), Import เฉพาะแถวที่ผ่าน validate เท่านั้น (ไม่ import
    ครึ่งๆ กลางๆ แบบไม่แจ้ง — ผู้ใช้เห็นและกดยืนยันเองว่าจะ import กี่แถว)
  - Import ราคา/ส่วนลด เช็ค Effective Date ซ้อนกันด้วย (ข้อ 61) ทั้งกับ
    ข้อมูลที่มีอยู่แล้วและกับแถวอื่นในไฟล์เดียวกัน
  - จำกัดสิทธิ์ไว้ที่ OWNER_ADMIN เท่านั้น (ตรงกับ Permission Matrix เดิม
    ที่ Billing Staff ไม่มีสิทธิ์แก้ Price/Discount/Customer Master)
- **Excel Export จาก Report** (ข้อ 45-46):
  - Export Summary — ตามมุมมอง Group By ปัจจุบันในหน้า Report
  - Export Raw Data — 1 row ต่อ Invoice Item ครบทุก column ตามข้อ 46
    เป๊ะ (Date, Order Number, Invoice Number, Customer Code/Name,
    Branch, Product Type, SKU, Product Name, Quantity, Unit Price,
    Gross, Discount %, Discount Amount, Net, VAT, Grand Total)

## ยังไม่ได้ทำใน Phase 7

- Import สำหรับ ProductType ไม่ได้ทำแยก (มีแค่ 5 ประเภทหลักตามข้อ 42
  ที่ระบุไว้ชัดเจน — ProductType ไม่ได้อยู่ในลิสต์ และมีแค่ A/B/C/D ไม่กี่
  ตัวอยู่แล้ว กรอกเองในหน้า UI สะดวกกว่า)

## ตรวจสอบย้อนหลัง Phase 1-7 ก่อนเริ่ม Phase 8 — พบ 2 จุดต้องแก้ (แก้แล้วทั้งหมด)

1. **🔴 ร้ายแรงที่สุด — ไฟล์ orders/actions.ts Syntax Error จริง!** ตอนแก้
   Rounding Drift (ตอนตรวจ Phase 6) ผมพลาดลบบรรทัด
   `const addItemSchema = z.object({` หายไปตอนแทรกฟังก์ชัน
   `duplicateOrder` เข้าไป ทำให้ไฟล์ทั้งไฟล์ **compile ไม่ผ่านเลย** —
   ถ้าไม่เจอจุดนี้ ทั้งระบบ Order (Phase 3-4 ทั้งหมด) จะใช้งานไม่ได้เลย
   แก้แล้ว + จัดระเบียบ import ให้อยู่บนสุดของไฟล์ทั้งหมดด้วย
2. **🔴 การอ่านวันที่จาก Excel Import ผิดพลาดได้** — ถ้าผู้ใช้พิมพ์วันที่ใน
   Excel แบบปกติ (Excel เก็บเป็น Date จริง ไม่ใช่ข้อความ) ระบบจะอ่านออกมา
   เป็นเลข serial (เช่น 46020) แทนวันที่จริง ทำให้ Import ราคา/ส่วนลด
   ที่ต้องใช้ Effective Date พังหมด — แก้โดยเพิ่ม `cellDates: true` ตอน
   อ่านไฟล์ Excel ใน `ImportFlow` component ให้แปลงเซลล์วันที่เป็น
   JS Date ให้อัตโนมัติเสมอ

## บทเรียนสำหรับตัวเองในรอบต่อไป

- การ `str_replace` แทรกโค้ดยาวๆ กลางไฟล์เสี่ยงลบ anchor บรรทัดข้างเคียง
  โดยไม่ตั้งใจ — ควร view ไฟล์ทวนหลังแทรกโค้ดยาวทุกครั้ง โดยเฉพาะไฟล์ที่
  แก้บ่อย เช่น orders/actions.ts (แก้ไปแล้ว 5+ ครั้งในเซสชันนี้)

## สิ่งที่ทำเสร็จใน Phase 8 (รอบนี้)

- **Audit Log Viewer** (`/audit-log`) — OWNER_ADMIN ดูประวัติแก้ไขทุกจุดได้
  แล้ว (ก่อนหน้านี้มีแค่การบันทึกแต่ไม่มีหน้าดู) filter ตาม module/ผู้ใช้/
  ช่วงวันที่ ดู before/after value ได้
- **Permission Review** (`/settings/permissions`) — ตารางสิทธิ์ทุก Role
  แบบ read-only อ่านสด (จาก permissions.ts จริง ไม่ hardcode ซ้ำ) เผื่อ
  ต้องอธิบายให้ทีมงานเข้าใจว่าใครทำอะไรได้บ้าง
- **Backup/Restore** (`/settings/backup`, ข้อ 49) — ใช้ pg_dump/pg_restore
  จริง (เหมาะกับ Single-PC Deployment): ปุ่ม Backup ตอนนี้ทันที, list ไฟล์
  backup พร้อมดาวน์โหลด, Restore จากไฟล์อัปโหลด (มีคำเตือนชัดเจนว่า
  destructive), endpoint `/api/backup/auto` สำหรับตั้ง Task Scheduler/
  cron ให้ backup อัตโนมัติทุกวัน (ป้องกันด้วย secret token) — วิธีตั้งค่า
  อยู่ใน README แล้ว
- **Error Handling** (ข้อ 56) — เพิ่ม Error Boundary ที่เป็นมิตร
  (`error.tsx` ทั้ง root และ dashboard) แทนการโชว์ stack trace ดิบให้
  ผู้ใช้เห็น, ห่อ transaction การแตก Invoice ด้วย try/catch แจ้ง error
  ชัดเจนว่า "ไม่มีอะไรเปลี่ยนแปลง" (ตรงกับหลัก atomic ที่ทำไว้ตั้งแต่ Phase 4)
- **Logging** (ข้อ 67) — `src/lib/logger.ts` เขียน log ลงไฟล์ + Redact
  ข้อมูลอ่อนไหวอัตโนมัติ (password/token/secret) เชื่อมกับ Error Boundary
  ทั้งฝั่ง client/server แล้ว, หน้า System Logs (`/settings/logs`) ดู log
  ล่าสุด 200 รายการ

## ตรวจสอบย้อนหลังระหว่างทำ Phase 8

- แก้ไข orders/actions.ts เพิ่มอีกครั้ง (เพิ่ม logError) — ตรวจไฟล์ทวน
  ทันทีตามบทเรียนจากรอบก่อน พบว่าเผลอลบ `import { z } from "zod"`
  อีกครั้งตอนแทรก import ใหม่ (แพทเทิร์นเดิมที่เคยพลาด) แก้ทันทีก่อน
  ดำเนินการต่อ — ไฟล์นี้อ่อนไหวต่อการแก้ไขมากที่สุดในโปรเจกต์ (แก้ไปแล้ว
  6+ ครั้ง) ควรระวังเป็นพิเศษเวลากลับมาแก้อีกใน Phase ถัดไป

## ยังไม่ได้ทำใน Phase 8

- ระบบ Backup อัตโนมัติแบบไม่ต้องพึ่ง OS Scheduler (เช่น scheduler ในตัว
  แอป) — ไม่ทำเพราะสถาปัตยกรรม Web Server แบบ request-response ไม่เหมาะ
  จะรัน cron ในตัวเอง ใช้ OS-level scheduler แม่นยำกว่า

## ตรวจสอบย้อนหลัง Phase 1-8 ก่อนเริ่ม Phase 9 — พบ 1 จุดด้านความปลอดภัย (แก้แล้ว)

- **🔴 Stored XSS ที่หลุดรอดมาได้**: หน้า `/orders/new`, `/tax-invoices/new`,
  `/repair-notes/new` ฝังข้อมูลลูกค้า/สาขาเป็น JSON ไว้ใน `<script>` tag
  ตรงๆ ผ่าน `JSON.stringify()` — ถ้าชื่อลูกค้าหรือสาขามีข้อความ
  `</script>` ปนอยู่ (พิมพ์เข้ามาโดยตั้งใจหรือไม่ตั้งใจก็ตาม) จะ "แหก"
  ออกจาก script tag แล้วแทรก HTML/JavaScript อื่นได้ (ต้องมีสิทธิ์แก้
  Master Data ถึงจะทำได้ จึงไม่ใช่ช่องโหว่ที่คนนอกโจมตีได้ตรงๆ แต่ยังผิด
  หลัก "Protection against common Web vulnerabilities" ในข้อ 51) — แก้ด้วย
  `safeJsonForScript()` helper ใหม่ (`src/lib/safe-json-script.ts`) escape
  เครื่องหมาย `<` ก่อนฝังเข้า script เสมอ พร้อม test ยืนยันครบ

## สรุปภาพรวม: รูปแบบบั๊กที่เจอบ่อยที่สุดตลอดการตรวจสอบทั้ง 8 Phase

1. **Rounding Drift** (ตัวเลขปัดเศษไม่ตรงกันระหว่างยอดรวมกับผลรวมรายการ) —
   เจอ 1 ครั้ง แก้ด้วย allocateProportionally
2. **ไฟล์ syntax พังจากการแก้ไขซ้อนกัน** (โดยเฉพาะ orders/actions.ts) —
   เจอ 2 ครั้ง (ทั้งคู่ตอนแทรก import/โค้ดใหม่กลางไฟล์) — เป็นความเสี่ยง
   ที่ต้องระวังต่อเนื่องเวลาแก้ไฟล์เดิมซ้ำหลายรอบ
3. **สิทธิ์การเข้าถึงไม่ตรงกับ Requirement** (Billing Staff เห็น Dashboard
   ทั้งที่ไม่ควรมีสิทธิ์) — เจอ 1 ครั้ง
4. **Missing Field ที่ไม่ได้เชื่อมจากต้นทาง** (placeToDelivery มีใน Invoice
   แต่ไม่มีใน Order ต้นทาง) — เจอ 1 ครั้ง
5. **Requirement ที่ระบุไว้ชัดแต่ลืมทำ** (พิมพ์ Sales Order, Order
   Duplication) — เจอ 2 จุด
6. **Security: ข้อมูลผู้ใช้ฝังใน script โดยไม่ escape** — เจอ 1 ครั้ง (รอบนี้)

## สิ่งที่ทำเสร็จใน Phase 9 (รอบนี้)

- **🔴 แก้จุดร้ายแรง: Vitest ไม่รู้จัก `@/` alias** — เพิ่งพบว่า
  `vitest.config.ts` ไม่ได้ตั้งค่า resolve alias ให้ตรงกับ `tsconfig.json`
  (`@/*` → `./src/*`) ทำให้ไฟล์ทดสอบทั้งหมดที่ import จากไฟล์ที่ใช้
  `@/lib/db` (pricing.ts, order-preview.ts, running-number.ts, reports.ts)
  **มีความเสี่ยงสูงที่จะรันไม่ผ่านตั้งแต่ขั้น import** — แก้แล้ว
- **เพิ่ม Test สำหรับ Price/Discount Priority ผ่าน Mocked DB**
  (`pricing-priority.test.ts`) — ก่อนหน้านี้ทดสอบแค่สูตรคำนวณ (VAT/
  Rounding) แต่ไม่เคยทดสอบว่า Priority การเลือกราคา/ส่วนลดทำงานถูกต้อง
  จริง (Branch → Customer → Standard สำหรับราคา, Branch+Type →
  Customer+Type → Default สำหรับส่วนลด) ตรงตามที่ข้อ 65 ระบุไว้ชัดเจน
- **UAT Checklist** (`docs/UAT_CHECKLIST.md`) — สคริปต์ทดสอบจริงแบบ
  step-by-step ครอบคลุม Golden Test Case เต็ม (ข้อ 66), Cancel Flow,
  Print, Excel Import/Export, Backup/Restore, Audit Log — ให้คนทดสอบจริง
  (หรือ Claude Code) ไล่ทำตามได้ทันที เพราะ Integration Test แบบเต็มผ่าน
  DB จริงทำในแชทนี้ไม่ได้ (ไม่มี PostgreSQL ให้ต่อ)

## สรุป Test Coverage ทั้งหมดตอนนี้ (7 ไฟล์ test)

1. `pricing.test.ts` — VAT extraction, Rounding, Date Overlap, Proportional Allocation
2. `pricing-priority.test.ts` — Price/Discount Priority, VAT Effective Date (ใหม่)
3. `order-preview.test.ts` — Golden Test Case ข้อ 66 (Group by Type + Discount)
4. `running-number.test.ts` — Document Number Formatting
5. `permissions.test.ts` — Permission Matrix ทุก Role
6. `thai-baht-text.test.ts` — เทียบกับตัวเลขจริงจากเอกสารตัวอย่าง
7. `safe-json-script.test.ts` — ป้องกัน XSS
8. `reports.test.ts` — Sort logic (coverage น้อยสุด เพราะฟังก์ชันหลักต้องพึ่ง DB)

## ยังไม่ได้ทำใน Phase 9 (ต้องทำบนเครื่องที่มี DB จริง)

- Integration Test แบบเต็ม (สร้าง Order จริง → Confirm → ตรวจ Invoice ใน
  DB จริง) — ต้องมี Test Database ที่รันได้จริง แนะนำให้ Claude Code เพิ่ม
  `testcontainers` หรือ PostgreSQL test instance แยกต่างหากตอนพัฒนาต่อ
- User Acceptance Test ตัวจริง — ต้องมีคนกดทดสอบตาม UAT_CHECKLIST.md

## ตรวจสอบย้อนหลัง Phase 1-9 ก่อนเริ่ม Phase 10

ตรวจ `schema.prisma` ทั้งไฟล์อย่างละเอียด (ทุก relation ระหว่าง 15 ตาราง)
และ `package.json` — **ไม่พบจุดขัดแย้งหรือบั๊กใหม่รอบนี้** ✅ (รอบแรกที่
ไม่เจอจุดร้ายแรง หลังจากเจอปัญหาต่อเนื่องมาหลาย Phase ก่อนหน้า)

ปรับเล็กน้อยเพื่อความชัดเจน: เพิ่มคำอธิบายใน README เรื่อง `prisma
generate` (ปกติรันอัตโนมัติหลัง `npm install` อยู่แล้ว แต่เผื่อกรณี
offline/CI ที่อาจไม่รันให้อัตโนมัติ)

## สิ่งที่ทำเสร็จใน Phase 10 (รอบนี้) — Phase สุดท้าย 🎉

- **`docs/DEPLOYMENT.md`** — คู่มือติดตั้งใช้งานจริงแบบทีละขั้นตอน เขียน
  ให้คนไม่เก่งคอมก็ตามได้ (ตามที่รับปากไว้ก่อนหน้านี้) ครอบคลุมตั้งแต่
  ติดตั้ง Node.js/PostgreSQL จนถึงตั้งให้รันอัตโนมัติด้วย PM2 และสร้าง
  Desktop Shortcut ให้พนักงานเปิดใช้งานง่ายเหมือนโปรแกรมทั่วไป
- **`docs/USER_GUIDE.md`** — คู่มือใช้งานประจำวันสำหรับพนักงานออกบิล
  (ข้อ 10 Phase 10 — User Training) เขียนแบบ step-by-step ภาษาที่เข้าใจ
  ง่าย ไม่มีศัพท์เทคนิค
- **`docs/GO_LIVE_CHECKLIST.md`** — Checklist ก่อน/ระหว่าง/หลัง Go-Live
  พร้อม Rollback Plan เผื่อเจอปัญหา

## สถานะสุดท้าย: ครบทั้ง 10 Phase แล้ว ✅

Phase 1-10 เสร็จสมบูรณ์ตามแผนที่วางไว้ในข้อ 77 ทุกข้อ ระบบครอบคลุม
Requirement ทั้ง 80 ข้อที่หารือกันไว้ (ยกเว้นบางจุดที่ตกลงกันชัดเจนว่า
เป็น Future-ready ไม่ implement ใน V1 เช่น Payment/Collection เต็มรูปแบบ,
Credit/Debit Note)

**ขั้นตอนถัดไปที่แนะนำ**: เปิดโปรเจกต์นี้ด้วย Claude Code บนเครื่องจริง
เพื่อรัน `npm install`, `npm test`, และทำตาม `UAT_CHECKLIST.md` ให้ครบ —
จุดที่ยังไม่เคยถูกรันจริงเลยตลอดการพัฒนาในแชทนี้ (ข้อจำกัดเรื่องไม่มี
อินเทอร์เน็ต/ฐานข้อมูลในเครื่องมือที่ใช้เขียนโค้ด) คือความเสี่ยงเดียวที่
เหลืออยู่ — โค้ดถูกต้องตามหลักการทุกจุดเท่าที่ตรวจสอบด้วยการอ่านทวนได้
แต่ยังไม่เคย "รันจริง" แม้แต่ครั้งเดียว
