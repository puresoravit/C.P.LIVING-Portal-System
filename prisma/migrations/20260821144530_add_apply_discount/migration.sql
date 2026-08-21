-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "applyDiscount" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "applyDiscount" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "applyDiscount" BOOLEAN NOT NULL DEFAULT true;
