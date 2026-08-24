-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "contactSnapshot" TEXT,
ADD COLUMN     "phoneSnapshot" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tax_invoice_items" ADD COLUMN     "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tax_invoices" ADD COLUMN     "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "grossAmount" DECIMAL(14,2);
