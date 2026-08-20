# Requirement Document — ระบบออกบิล V1

อ้างอิงจากการหารือทั้งหมด (80 ข้อ) สรุปเป็นหมวดหมู่เพื่อใช้อ้างอิงระหว่างพัฒนา

## 1. Objective & Scope

- Web Application ทดแทนระบบออกบิลเดิม ของโรงงานผลิตที่นอน
- หลักการหลัก: **"คีย์ครั้งเดียว"** — พนักงานคีย์ Order รวมทุก Product Type
  ปนกันได้ ระบบคำนวณราคา/ส่วนลด/แยกบิล/สร้างรายงานอัตโนมัติ
- Scope V1: Customer, Product, Price, Discount, Sales Order, Billing/Invoice,
  VAT, Printing, Sales Report, Dashboard, Excel Import/Export
- **Out of Scope V1** (ห้ามเพิ่มเองโดยไม่ Approve): Inventory, Purchase,
  Production/MRP, BOM, QC, Accounting เต็มระบบ, GL, AP, Payroll, HR, CRM

## 2. Master Data

- **Customer**: 1 บริษัท → หลาย Branch. Field: code, companyName, taxId,
  phone, email, creditTerm (CASH/NET30/60/90 — ปัจจุบันทุกรายเป็น CASH),
  note, active
- **Branch**: ผูกกับ Customer. Field: code (unique ต่อ Customer), name,
  taxBranchCode (00000/00001...), address, province, postalCode, phone,
  contactPerson, note, active. ดูยอดได้ทั้งรวม Customer และแยกรายสาขา
- **Product Type**: Master แยก ห้าม hardcode A/B/C ใน code. Field: code,
  name, description, active, sortOrder. เริ่มต้น A/B/C, เพิ่ม D+ ได้จาก UI
- **Product**: SKU unique. Field: sku, name, productTypeId, size, unit,
  standardPrice (**รวม VAT แล้ว**), description, active. Product Type
  ดึงจาก Master เท่านั้น พนักงานเลือกเองไม่ได้ตอนออก Order

## 3. Price Engine

- **Price Rule** ระดับ Product / Customer×Product / Branch×Product
  (Special Price = ราคาตั้งต้นก่อนหักส่วนลด ไม่ใช่ราคาสุทธิ)
- **Priority**: Branch Price → Customer Price → Standard Price
- ทุกระดับมี Effective From/To — ห้ามซ้อนกันโดยไม่ตั้งใจ (validate overlap)
- Order อ้างอิงราคาตาม **Order Date** ไม่ใช่วันที่ปัจจุบัน
- ราคาทุกระดับเป็น **VAT-inclusive**

## 4. Discount Engine

- Discount Rule: Customer + Branch(optional) + Product Type + % + Effective Date
- Priority: Branch+Type → Customer+Type → Default (0%)
- Discount คำนวณแยกจาก Special Price เป็นคนละชั้น (ไม่ปนกัน) —
  หัก % จากราคาตั้งต้นตามปกติเสมอ

## 5. VAT

- Rate เป็น Config มี Effective Date (ห้าม hardcode 7%)
- สูตรถอด VAT จากราคารวม: `VAT = ยอดรวม × 7 ÷ 107`
- Rounding: ทศนิยม 2 ตำแหน่ง, **Round Half Up**
- **ใบส่งของชั่วคราว = ไม่มี VAT** (แจ้งส่งของจริง) / **ใบกำกับภาษี = แยก
  เอกสารต่างหาก ออกตามหลัง** — บางลูกค้าขอ VAT ไม่เต็มยอด (พนักงานเลือก
  รายการ/ยอดเองแล้ว reconcile กับที่ลูกค้าแจ้ง) / ลูกค้าที่ขอ VAT 100%
  auto-generate จากใบส่งของได้เลย — **Tax Invoice ไม่ผูก 1:1 กับ Invoice
  เสมอไป ต้องมีทั้งโหมด Auto และ Manual**

## 6. Sales Order → Auto Split Invoice

Flow: Login → เลือก Customer → Branch → Create Order → คีย์ SKU+Qty (รวม
ทุก Type ในออเดอร์เดียว) → Auto Product Lookup → Auto Price Lookup (ตาม
Order Date) → Auto Type Classification → Auto Discount → Group by Type →
**Preview** (แยกตาม Type พร้อม Gross/Discount/Net) → Confirm → **Auto
Generate Invoice แยกตาม Type** (ห้ามสร้าง Empty Invoice) → Print/PDF →
Sales Database → Dashboard/Report/Excel

- Invoice ทุกใบเก็บ **Parent Order ID** อ้างอิงกลับ
- Running Number แยกชุดต่อ Type+เดือน: `INV-{Type}-YYYYMM-####`
  รีเซ็ตทุกเดือน, ต้อง concurrency-safe (atomic, ไม่ใช่ MAX+1)
- **Document Snapshot**: Invoice/Invoice Item เก็บค่าทุกอย่างที่โผล่บน
  เอกสาร (ชื่อลูกค้า, ที่อยู่, ราคา, ส่วนลด, VAT ฯลฯ) ไว้ในตัวเอง แก้
  Master Data ภายหลังห้ามกระทบ Invoice เก่า — Reprint ต้องใช้ Snapshot
  เท่านั้น ห้ามดึงค่าปัจจุบันมาทับ

## 7. Status & Editing Rules

- Order: DRAFT → CONFIRMED → CANCELLED
- Invoice: DRAFT → CONFIRMED → PRINTED → CANCELLED (เผื่อ PAID ในอนาคต)
- Draft แก้ได้ตาม Permission / Confirmed ห้ามแก้ตรงๆ ต้องผ่าน Controlled
  Workflow / ห้าม Hard Delete Confirmed Invoice / Cancelled ต้องยังค้นหาได้
- **Cancel Order**: ถ้ามี Invoice ที่สร้างแล้ว ต้อง **Block** การ Cancel
  Order จนกว่า Invoice ทั้งหมดจะถูก Cancel ก่อน (ไม่ Cascade อัตโนมัติ)
- Billing Staff ยกเลิก Order/Invoice ของตัวเองได้เลย ไม่ต้องขอ Approve

## 8. Documents (4 ประเภท — ต้องพิมพ์ได้ทั้ง PDF และกระดาษต่อเนื่อง 4 ชั้น)

1. **ใบส่งของชั่วคราว / INVOICE** — ไม่มี VAT, มีสถานที่ส่งสินค้าแยกจาก
   Branch Address, มีทะเบียนรถ (กรอกมือ ไม่เก็บ DB)
2. **ใบส่งคืนสินค้าฝากซ่อม** — ไม่มีราคา, เลขที่ `DEP-YYYYMM-###`
3. **ใบกำกับภาษี/ใบเสร็จรับเงิน** — มี VAT breakdown, เลขที่ `TX-YYYYMM-###`
4. **ใบวางบิล (Billing Note)** — สรุปหลาย Invoice ที่ครบกำหนด พร้อมยอด
   ชำระแล้ว/คงค้าง, เลขที่ `BI-YYYYMM-###`

ทุกเอกสารมี field ตามฟอร์มจริงที่ใช้งานอยู่: หัวบริษัท, เลขที่, วันที่,
รหัสลูกค้า, ข้อมูลลูกค้า+ที่อยู่, สถานที่ส่งสินค้า, เงื่อนไข/Due
Date/Ref, พนักงานขาย, ตารางรายการ, รวม/ส่วนลด/สุทธิ (+VAT breakdown ถ้ามี),
จำนวนเงินเป็นตัวอักษรไทย, หมายเหตุ, ช่องลงชื่อ 3 ฝ่าย

Print Template ต้องแยกจาก Business Logic — ปรับ Margin/Font/Column/
Header/Footer/Paper Size ได้โดยไม่แก้ core logic

## 9. Reports & Dashboard

- Sales Report: filter by date/month/customer/branch/type/sku, metrics
  (qty, gross, discount, net, VAT, total), group by ได้หลายมิติ
- Report เฉพาะทาง: Product Type, Product (best-seller ranking), Customer
  (drill-down ไป Branch), Branch
- Dashboard: ยอดเดือนนี้ (gross/net/qty), ยอดแยก Type, Top 5
  Customer/Product, เลือกช่วงเวลาได้

## 10. Excel Import/Export

- Import: Customer, Branch, Product, Price, Discount — มี Template
  ให้ดาวน์โหลดแยกไฟล์, ต้อง Validate+Preview ก่อน import จริง (แสดง
  row/error reason), ห้าม import ครึ่งหนึ่งโดยไม่แจ้ง
- Export: Summary + Raw Data (1 row/invoice item) พร้อม column ครบ

## 11. Security / Audit / Data Integrity

- Password bcrypt เท่านั้น, Role-based Permission (OWNER_ADMIN/
  BILLING_STAFF/VIEWER), Session mgmt, Input validation, ป้องกัน
  web vuln ทั่วไป
- Audit Log ทุก module สำคัญ (Price/Discount/Product/Customer/Order/
  Invoice/Cancellation/Permission): user, action, module, record,
  old/new value, timestamp
- Master Data / Transaction ห้าม Hard Delete — ใช้ Active/Inactive
- Backup: Auto + Manual + Restore พร้อมเอกสารขั้นตอน
- Data Ownership: Export ข้อมูลออกได้เสมอ ไม่ Lock

## 12. Non-functional

- Priority การตัดสินใจ (สำคัญสุดก่อน): Data Correctness > Business
  Logic Correctness > Ease of Use > Speed > Traceability > Reporting >
  Maintainability > UI Appearance
- UX: เร็ว, คีย์น้อย, ผิดยาก, keyboard-friendly (หน้า Order Entry)
- Desktop-primary, Responsive รองรับ Tablet/Mobile (ไม่ mobile-first)
- ภาษาไทยหลัก, THB, ทศนิยม/comma/วันที่แบบไทย
- Performance: search เร็ว, report ไม่ process ฝั่ง browser ทั้งหมด
- Error handling: ต้อง atomic (all-or-nothing) ตอนแตก Invoice หลายใบ

## 13. Testing Requirement

ต้องมี Automated Test ครอบคลุม: Price Priority, Price Effective Date,
Discount Priority, Discount Effective Date, Product Type Split, VAT
Calculation, Rounding, Invoice Generation, Running Number, Snapshot,
Permission, Cancellation — พร้อม Golden Test Case ตามตัวอย่าง
Customer ABC/Branch 01 ที่มี Order ผสม 3 Type แล้วตรวจครบทุก field

## 14. Future-ready (ไม่ implement ใน V1 แต่ต้องออกแบบให้ต่อยอดได้)

Inventory, Purchase, Production, BOM, Accounting Integration,
Payment/Collection Module (Invoice data model ต้องแยก concern จาก
payment logic ไว้ตั้งแต่ต้น), Credit/Debit Note, Accounts Receivable
