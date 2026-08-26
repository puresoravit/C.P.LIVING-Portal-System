-- AlterTable
ALTER TABLE "product_models" ADD COLUMN     "catalogId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "catalogId" TEXT;

-- CreateTable
CREATE TABLE "product_catalogs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_catalog_companies" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_catalog_companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_catalog_companies_customerId_key" ON "product_catalog_companies"("customerId");

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "product_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_catalog_companies" ADD CONSTRAINT "product_catalog_companies_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "product_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_catalog_companies" ADD CONSTRAINT "product_catalog_companies_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "product_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
