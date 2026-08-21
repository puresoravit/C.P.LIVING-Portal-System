-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_productTypeId_fkey";

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "productTypeId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "product_sku_sequence" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_sku_sequence_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "product_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
