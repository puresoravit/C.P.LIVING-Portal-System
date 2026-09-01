-- Owner Approve (2026-09-02) — Physical Sheet ต่อใบส่งของ (Option B): additive ล้วนๆ
-- ห้ามมี DROP/ALTER ทำลายข้อมูลใดๆ — ดูเหตุผลเต็มที่ model InvoiceSheet ใน schema.prisma

-- CreateTable
CREATE TABLE "invoice_sheets" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sheetNo" INTEGER NOT NULL,
    "sheetNumber" TEXT NOT NULL,
    "numberReleased" BOOLEAN NOT NULL DEFAULT false,
    "printedAt" TIMESTAMP(3),
    "printedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_sheets_pkey" PRIMARY KEY ("id")
);

-- AlterTable (additive nullable columns เท่านั้น)
ALTER TABLE "invoice_items" ADD COLUMN     "lineNo" INTEGER,
ADD COLUMN     "sheetId" TEXT;

-- CreateIndex
CREATE INDEX "invoice_sheets_invoiceId_idx" ON "invoice_sheets"("invoiceId");
CREATE INDEX "invoice_sheets_sheetNumber_idx" ON "invoice_sheets"("sheetNumber");

-- Partial Unique (Pattern เดียวกับ 20260831131508_document_number_partial_unique_reclaim):
-- เลขแผ่นซ้ำได้เฉพาะแถวที่ถูกปล่อยเลขคืนแล้วเท่านั้น — แถว Active ต่อเลขมีได้แถวเดียวเสมอ
CREATE UNIQUE INDEX "invoice_sheets_sheetNumber_active_key" ON "invoice_sheets"("sheetNumber") WHERE NOT "numberReleased";

-- AddForeignKey
ALTER TABLE "invoice_sheets" ADD CONSTRAINT "invoice_sheets_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "invoice_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
