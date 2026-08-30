-- CreateEnum
CREATE TYPE "AllocationKind" AS ENUM ('FRESH', 'OUTSTANDING', 'ADHOC', 'CUT');

-- AlterTable
ALTER TABLE "loading_lines" ADD COLUMN     "plannedOutstandingId" TEXT;

-- CreateTable
CREATE TABLE "loading_allocations" (
    "id" TEXT NOT NULL,
    "loadingLineId" TEXT,
    "kind" "AllocationKind" NOT NULL,
    "outstandingId" TEXT,
    "customerPoLineId" TEXT,
    "qty" INTEGER NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loading_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outstanding_deliveries" (
    "id" TEXT NOT NULL,
    "customerPoLineId" TEXT NOT NULL,
    "qtyOriginal" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT NOT NULL,
    "openedFromTripId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outstanding_deliveries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "loading_allocations" ADD CONSTRAINT "loading_allocations_loadingLineId_fkey" FOREIGN KEY ("loadingLineId") REFERENCES "loading_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loading_allocations" ADD CONSTRAINT "loading_allocations_outstandingId_fkey" FOREIGN KEY ("outstandingId") REFERENCES "outstanding_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
