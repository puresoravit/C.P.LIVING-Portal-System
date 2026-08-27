-- CreateEnum
CREATE TYPE "TaxVatCalcMode" AS ENUM ('EXTRACT', 'ADD_ON');

-- AlterEnum
ALTER TYPE "QuotationVatMode" ADD VALUE 'ADD_ON';

-- AlterTable
ALTER TABLE "tax_invoices" ADD COLUMN     "vatCalcMode" "TaxVatCalcMode" NOT NULL DEFAULT 'EXTRACT';
