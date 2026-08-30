-- CreateEnum
CREATE TYPE "LoadingSourceType" AS ENUM ('FRESH', 'OUTSTANDING', 'ADHOC');

-- CreateTable
CREATE TABLE "loading_trips" (
    "id" TEXT NOT NULL,
    "tripNo" TEXT NOT NULL,
    "tripDate" TIMESTAMP(3) NOT NULL,
    "vehicleNote" TEXT,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "loadedAt" TIMESTAMP(3),
    "loadedById" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loading_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loading_drops" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT,
    "photoPaths" TEXT[],
    "note" TEXT,

    CONSTRAINT "loading_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loading_lines" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "sourceType" "LoadingSourceType" NOT NULL,
    "customerPoLineId" TEXT,
    "productionItemId" TEXT,
    "productId" TEXT,
    "skuSnapshot" TEXT,
    "labelSnapshot" TEXT NOT NULL,
    "size" TEXT,
    "qtyPlanned" INTEGER NOT NULL,
    "qtyLoaded" INTEGER,
    "note" TEXT,

    CONSTRAINT "loading_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loading_trips_tripNo_key" ON "loading_trips"("tripNo");

-- CreateIndex
CREATE UNIQUE INDEX "loading_drops_tripId_seq_key" ON "loading_drops"("tripId", "seq");

-- AddForeignKey
ALTER TABLE "loading_drops" ADD CONSTRAINT "loading_drops_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "loading_trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loading_lines" ADD CONSTRAINT "loading_lines_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "loading_drops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
