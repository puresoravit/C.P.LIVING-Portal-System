-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "productionStartedAt" TIMESTAMP(3),
ADD COLUMN     "productionStartedById" TEXT;
