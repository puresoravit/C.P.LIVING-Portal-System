-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "editedAfterPrintAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "invoice_pending_redeliveries" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "reducedAmount" DECIMAL(14,2) NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "invoice_pending_redeliveries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "invoice_pending_redeliveries" ADD CONSTRAINT "invoice_pending_redeliveries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
