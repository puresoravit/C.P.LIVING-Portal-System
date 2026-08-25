-- AlterEnum
ALTER TYPE "TaxInvoiceStatus" ADD VALUE 'PRINTED';

-- AlterTable
ALTER TABLE "tax_invoices" ADD COLUMN     "countAsSales" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "printedAt" TIMESTAMP(3),
ADD COLUMN     "printedById" TEXT;
