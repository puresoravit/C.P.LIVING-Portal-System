-- AlterEnum
ALTER TYPE "RevisionChangeType" ADD VALUE 'CANCEL_ORDER';

-- AlterTable
ALTER TABLE "customer_pos" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;
