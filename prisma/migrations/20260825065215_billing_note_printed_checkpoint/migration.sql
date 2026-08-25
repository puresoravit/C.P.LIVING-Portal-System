-- AlterEnum
ALTER TYPE "BillingNoteStatus" ADD VALUE 'PRINTED';

-- AlterTable
ALTER TABLE "billing_notes" ADD COLUMN     "printedAt" TIMESTAMP(3),
ADD COLUMN     "printedById" TEXT;
