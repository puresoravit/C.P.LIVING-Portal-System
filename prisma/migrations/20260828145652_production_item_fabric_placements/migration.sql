/*
  Warnings:

  - You are about to drop the column `fabricBottom` on the `production_items` table. All the data in the column will be lost.
  - You are about to drop the column `fabricBottomLabel` on the `production_items` table. All the data in the column will be lost.
  - You are about to drop the column `fabricSide` on the `production_items` table. All the data in the column will be lost.
  - You are about to drop the column `fabricSideLabel` on the `production_items` table. All the data in the column will be lost.
  - You are about to drop the column `fabricTop` on the `production_items` table. All the data in the column will be lost.
  - You are about to drop the column `fabricTopLabel` on the `production_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "production_items" DROP COLUMN "fabricBottom",
DROP COLUMN "fabricBottomLabel",
DROP COLUMN "fabricSide",
DROP COLUMN "fabricSideLabel",
DROP COLUMN "fabricTop",
DROP COLUMN "fabricTopLabel";

-- CreateTable
CREATE TABLE "production_item_fabrics" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "fabricName" TEXT NOT NULL,
    "fabricCode" TEXT,
    "waddingWeight" TEXT,
    "foamThickness" TEXT,
    "colorNote" TEXT,
    "displayOverride" TEXT,
    "extra" JSONB,

    CONSTRAINT "production_item_fabrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_item_fabrics_itemId_placement_seq_key" ON "production_item_fabrics"("itemId", "placement", "seq");

-- AddForeignKey
ALTER TABLE "production_item_fabrics" ADD CONSTRAINT "production_item_fabrics_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "production_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
