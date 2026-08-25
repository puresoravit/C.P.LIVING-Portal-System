-- AlterTable
ALTER TABLE "billing_notes" ADD COLUMN     "applyDiscount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discountDetail" JSONB;
