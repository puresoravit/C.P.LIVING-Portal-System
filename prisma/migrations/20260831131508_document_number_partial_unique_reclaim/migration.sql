-- DropIndex
DROP INDEX "billing_notes_billingNoteNumber_key";

-- DropIndex
DROP INDEX "invoices_invoiceNumber_key";

-- DropIndex
DROP INDEX "orders_orderNumber_key";

-- DropIndex
DROP INDEX "quotations_quotationNumber_key";

-- DropIndex
DROP INDEX "repair_return_notes_noteNumber_key";

-- DropIndex
DROP INDEX "tax_invoices_taxInvoiceNumber_key";

-- AlterTable
ALTER TABLE "billing_notes" ADD COLUMN     "numberReleased" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "numberReleased" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "numberReleased" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "numberReleased" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "repair_return_notes" ADD COLUMN     "numberReleased" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tax_invoices" ADD COLUMN     "numberReleased" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "billing_notes_billingNoteNumber_idx" ON "billing_notes"("billingNoteNumber");

-- CreateIndex
CREATE INDEX "invoices_invoiceNumber_idx" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "orders_orderNumber_idx" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "quotations_quotationNumber_idx" ON "quotations"("quotationNumber");

-- CreateIndex
CREATE INDEX "repair_return_notes_noteNumber_idx" ON "repair_return_notes"("noteNumber");

-- CreateIndex
CREATE INDEX "tax_invoices_taxInvoiceNumber_idx" ON "tax_invoices"("taxInvoiceNumber");

-- Owner UAT (2026-08-31) — Partial Unique Index แทน @unique ธรรมดา: บังคับ Unique จริง
-- เฉพาะแถวที่ยัง Active (numberReleased = false) เท่านั้น แถวที่ถูกยกเลิก+ดึงเลขคืนแล้ว
-- (numberReleased = true) ไม่ถูกนับในเงื่อนไข Unique นี้อีกต่อไป — เอกสารใหม่จึงใช้เลข
-- เดียวกับแถวเก่าที่ถูกปล่อยคืนได้โดยไม่ชนกัน (Root Cause ของ Incident 2026-08-31 คือ
-- @unique เดิมบังคับ Unique ทั้งตารางเสมอ ทำให้แถวที่ถูกยกเลิก [Soft-delete ไม่เคยลบจริง]
-- ยังครองเลขเดิมไว้ตลอดไป ชนกับความพยายาม Reuse ทุกครั้งไม่มีข้อยกเว้น) — Prisma Schema
-- ไม่มี Syntax แสดง Partial Unique ได้ตรงๆ จึงต้องเขียน SQL มือที่นี่ (Migration นี้จะไม่ถูก
-- แก้ทับโดย `prisma migrate dev` รอบถัดไปตราบใดที่ไม่มีใครไปแตะ @@index ทั้ง 6 นี้ในสคีมา)
CREATE UNIQUE INDEX "orders_orderNumber_active_key" ON "orders"("orderNumber") WHERE NOT "numberReleased";
CREATE UNIQUE INDEX "invoices_invoiceNumber_active_key" ON "invoices"("invoiceNumber") WHERE NOT "numberReleased";
CREATE UNIQUE INDEX "tax_invoices_taxInvoiceNumber_active_key" ON "tax_invoices"("taxInvoiceNumber") WHERE NOT "numberReleased";
CREATE UNIQUE INDEX "billing_notes_billingNoteNumber_active_key" ON "billing_notes"("billingNoteNumber") WHERE NOT "numberReleased";
CREATE UNIQUE INDEX "quotations_quotationNumber_active_key" ON "quotations"("quotationNumber") WHERE NOT "numberReleased";
CREATE UNIQUE INDEX "repair_return_notes_noteNumber_active_key" ON "repair_return_notes"("noteNumber") WHERE NOT "numberReleased";
