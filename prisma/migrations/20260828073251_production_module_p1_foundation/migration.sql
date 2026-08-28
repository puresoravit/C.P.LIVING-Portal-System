-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "AliasScope" AS ENUM ('GLOBAL', 'CUSTOMER', 'BRANCH');

-- CreateEnum
CREATE TYPE "DateMode" AS ENUM ('UNSET', 'ESTIMATE', 'EXACT');

-- CreateEnum
CREATE TYPE "OrderLineKind" AS ENUM ('CATALOG', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "RevisionChangeType" AS ENUM ('ADD_LINE', 'QTY_CHANGE', 'CANCEL_LINE', 'RESOLVE_PRODUCT', 'ORDER_LEVEL');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "customerPoId" TEXT,
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "color" TEXT,
ADD COLUMN     "form" TEXT,
ADD COLUMN     "material" TEXT,
ADD COLUMN     "productionLabel" TEXT,
ADD COLUMN     "productionStatus" "ProductionStatus",
ADD COLUMN     "thickness" TEXT;

-- CreateTable
CREATE TABLE "product_aliases" (
    "id" TEXT NOT NULL,
    "productModelId" TEXT,
    "productId" TEXT,
    "aliasText" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "lang" TEXT,
    "scope" "AliasScope" NOT NULL DEFAULT 'GLOBAL',
    "customerId" TEXT,
    "branchId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_order_sequences" (
    "branchId" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "branch_order_sequences_pkey" PRIMARY KEY ("branchId")
);

-- CreateTable
CREATE TABLE "customer_pos" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT,
    "dateMode" "DateMode" NOT NULL DEFAULT 'UNSET',
    "requestedDate" TIMESTAMP(3),
    "orderSeqNo" INTEGER,
    "urgency" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "poImagePaths" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 0,
    "revCounter" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_po_lines" (
    "id" TEXT NOT NULL,
    "customerPoId" TEXT NOT NULL,
    "lineKind" "OrderLineKind" NOT NULL DEFAULT 'CATALOG',
    "productId" TEXT,
    "rawProductText" TEXT,
    "size" TEXT,
    "qtyCurrent" INTEGER NOT NULL,
    "urgency" BOOLEAN NOT NULL DEFAULT false,
    "requiredDate" TIMESTAMP(3),
    "isCustomSize" BOOLEAN NOT NULL DEFAULT false,
    "customW" DECIMAL(8,2),
    "customL" DECIMAL(8,2),
    "customThickness" TEXT,
    "note" TEXT,

    CONSTRAINT "customer_po_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_po_revisions" (
    "id" TEXT NOT NULL,
    "customerPoId" TEXT NOT NULL,
    "revNo" INTEGER NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_po_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_po_revision_changes" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "orderLineId" TEXT,
    "changeType" "RevisionChangeType" NOT NULL,
    "qtyDelta" INTEGER,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,

    CONSTRAINT "customer_po_revision_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "prodNo" TEXT NOT NULL,
    "customerPoId" TEXT NOT NULL,
    "currentRevNo" INTEGER NOT NULL DEFAULT 0,
    "revCounter" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_revisions" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "revNo" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" TIMESTAMP(3),
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "snapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_order_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_items" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "customerPoLineId" TEXT,
    "productId" TEXT,
    "size" TEXT,
    "isCustomSize" BOOLEAN NOT NULL DEFAULT false,
    "customW" DECIMAL(8,2),
    "customL" DECIMAL(8,2),
    "customThickness" TEXT,
    "qty" INTEGER NOT NULL,
    "gussetCount" INTEGER,
    "thickness" TEXT,
    "fabricTop" JSONB NOT NULL,
    "fabricSide" JSONB NOT NULL,
    "fabricBottom" JSONB NOT NULL,
    "fabricTopLabel" TEXT,
    "fabricSideLabel" TEXT,
    "fabricBottomLabel" TEXT,
    "specHash" TEXT NOT NULL,
    "note" TEXT,
    "skuSnapshot" TEXT,
    "nameSnapshot" TEXT,
    "productionLabelSnapshot" TEXT,

    CONSTRAINT "production_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_item_layers" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "material" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "displayOverride" TEXT,

    CONSTRAINT "production_item_layers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_aliases_aliasNormalized_idx" ON "product_aliases"("aliasNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "customer_po_revisions_customerPoId_revNo_key" ON "customer_po_revisions"("customerPoId", "revNo");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_prodNo_key" ON "production_orders"("prodNo");

-- CreateIndex
CREATE UNIQUE INDEX "production_order_revisions_productionOrderId_revNo_key" ON "production_order_revisions"("productionOrderId", "revNo");

-- CreateIndex
CREATE INDEX "production_items_specHash_idx" ON "production_items"("specHash");

-- CreateIndex
CREATE INDEX "audit_logs_customerId_createdAt_idx" ON "audit_logs"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_branchId_createdAt_idx" ON "audit_logs"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_customerPoId_createdAt_idx" ON "audit_logs"("customerPoId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_correlationId_idx" ON "audit_logs"("correlationId");

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "product_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_order_sequences" ADD CONSTRAINT "branch_order_sequences_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_pos" ADD CONSTRAINT "customer_pos_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_pos" ADD CONSTRAINT "customer_pos_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_po_lines" ADD CONSTRAINT "customer_po_lines_customerPoId_fkey" FOREIGN KEY ("customerPoId") REFERENCES "customer_pos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_po_lines" ADD CONSTRAINT "customer_po_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_po_revisions" ADD CONSTRAINT "customer_po_revisions_customerPoId_fkey" FOREIGN KEY ("customerPoId") REFERENCES "customer_pos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_po_revision_changes" ADD CONSTRAINT "customer_po_revision_changes_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "customer_po_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_po_revision_changes" ADD CONSTRAINT "customer_po_revision_changes_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "customer_po_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_customerPoId_fkey" FOREIGN KEY ("customerPoId") REFERENCES "customer_pos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_revisions" ADD CONSTRAINT "production_order_revisions_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "production_order_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_customerPoLineId_fkey" FOREIGN KEY ("customerPoLineId") REFERENCES "customer_po_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_item_layers" ADD CONSTRAINT "production_item_layers_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "production_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
