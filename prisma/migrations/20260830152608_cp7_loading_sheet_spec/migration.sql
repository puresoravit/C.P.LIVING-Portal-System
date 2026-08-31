-- AlterTable
ALTER TABLE "loading_drops" ADD COLUMN     "destinationLabel" TEXT;

-- AlterTable
ALTER TABLE "loading_trips" ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "plateNumber" TEXT;
