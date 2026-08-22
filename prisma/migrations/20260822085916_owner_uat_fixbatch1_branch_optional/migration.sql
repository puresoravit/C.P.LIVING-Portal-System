-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_branchId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_branchId_fkey";

-- DropForeignKey
ALTER TABLE "quotations" DROP CONSTRAINT "quotations_branchId_fkey";

-- DropForeignKey
ALTER TABLE "repair_return_notes" DROP CONSTRAINT "repair_return_notes_branchId_fkey";

-- DropForeignKey
ALTER TABLE "tax_invoices" DROP CONSTRAINT "tax_invoices_branchId_fkey";

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "branchId" DROP NOT NULL,
ALTER COLUMN "branchNameSnapshot" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "branchId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "quotations" ALTER COLUMN "branchId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "repair_return_note_items" ADD COLUMN     "size" TEXT;

-- AlterTable
ALTER TABLE "repair_return_notes" ALTER COLUMN "branchId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tax_invoices" ALTER COLUMN "branchId" DROP NOT NULL,
ALTER COLUMN "branchNameSnapshot" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_return_notes" ADD CONSTRAINT "repair_return_notes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
