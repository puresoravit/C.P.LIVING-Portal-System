-- AlterTable
ALTER TABLE "loading_drops" ADD COLUMN     "productionOrderId" TEXT;

-- AlterTable
ALTER TABLE "loading_trips" ADD COLUMN     "sheetPrintedAt" TIMESTAMP(3),
ADD COLUMN     "sheetPrintedById" TEXT,
ADD COLUMN     "sheetPrintedVersion" INTEGER;

-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "productionCompletedAt" TIMESTAMP(3),
ADD COLUMN     "productionCompletedById" TEXT;
