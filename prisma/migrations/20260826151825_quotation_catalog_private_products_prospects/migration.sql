-- AlterTable
ALTER TABLE "product_catalogs" ADD COLUMN     "isQuotationCatalog" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "product_models" ADD COLUMN     "ownerCustomerId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "ownerCustomerId" TEXT;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "prospectId" TEXT;

-- CreateTable
CREATE TABLE "quotation_prospects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "address" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "linkedCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_prospects_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_ownerCustomerId_fkey" FOREIGN KEY ("ownerCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_ownerCustomerId_fkey" FOREIGN KEY ("ownerCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_prospects" ADD CONSTRAINT "quotation_prospects_linkedCustomerId_fkey" FOREIGN KEY ("linkedCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "quotation_prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
