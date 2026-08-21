-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotationVatMode" AS ENUM ('NONE', 'STANDARD');

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "placeToDelivery" TEXT,
    "vatMode" "QuotationVatMode" NOT NULL DEFAULT 'NONE',
    "customerNameSnapshot" TEXT,
    "customerTaxIdSnapshot" TEXT,
    "branchNameSnapshot" TEXT,
    "addressSnapshot" TEXT,
    "grossAmount" DECIMAL(14,2),
    "discountAmount" DECIMAL(14,2),
    "vatRateSnapshot" DECIMAL(5,2),
    "netBeforeVat" DECIMAL(14,2),
    "vatAmount" DECIMAL(14,2),
    "grandTotal" DECIMAL(14,2),
    "revisionNo" INTEGER NOT NULL DEFAULT 0,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "descriptionOverride" TEXT,
    "skuSnapshot" TEXT,
    "productNameSnapshot" TEXT,
    "productTypeSnapshot" TEXT,
    "sizeSnapshot" TEXT,
    "unitSnapshot" TEXT,
    "unitPriceSnapshot" DECIMAL(12,2),
    "grossAmount" DECIMAL(14,2),
    "discountAmount" DECIMAL(14,2),
    "netAmount" DECIMAL(14,2),

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotationNumber_key" ON "quotations"("quotationNumber");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
