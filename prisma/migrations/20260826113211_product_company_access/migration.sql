-- CreateTable
CREATE TABLE "product_company_access" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "productModelId" TEXT,
    "customerId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_company_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_company_access_customerId_idx" ON "product_company_access"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "product_company_access_productId_customerId_key" ON "product_company_access"("productId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "product_company_access_productModelId_customerId_key" ON "product_company_access"("productModelId", "customerId");

-- AddForeignKey
ALTER TABLE "product_company_access" ADD CONSTRAINT "product_company_access_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_company_access" ADD CONSTRAINT "product_company_access_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "product_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_company_access" ADD CONSTRAINT "product_company_access_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
