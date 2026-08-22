-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "sizeOverride" TEXT,
ADD COLUMN     "unitPriceOverride" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "product_models" ADD COLUMN     "pricePerFoot" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN     "sizeOverride" TEXT,
ADD COLUMN     "unitPriceOverride" DECIMAL(12,2);
