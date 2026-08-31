-- AlterTable
ALTER TABLE "production_item_fabrics" ADD COLUMN     "printVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "production_item_layers" ADD COLUMN     "printVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "production_master_specs" (
    "id" TEXT NOT NULL,
    "specName" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "thickness" TEXT NOT NULL DEFAULT '',
    "gussetCount" INTEGER NOT NULL DEFAULT 0,
    "headKind" TEXT,
    "headId" TEXT,
    "approxThickness" TEXT,
    "titleRaw" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_master_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_master_fabrics" (
    "id" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "fabricName" TEXT NOT NULL,
    "fabricCode" TEXT,
    "waddingWeight" TEXT,
    "foamThickness" TEXT,
    "colorNote" TEXT,
    "displayOverride" TEXT,
    "printVisible" BOOLEAN NOT NULL DEFAULT true,
    "extra" JSONB,

    CONSTRAINT "production_master_fabrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_master_layers" (
    "id" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "material" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "displayOverride" TEXT,
    "printVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "production_master_layers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_master_specs_specName_variant_thickness_gussetCo_key" ON "production_master_specs"("specName", "variant", "thickness", "gussetCount");

-- CreateIndex
CREATE UNIQUE INDEX "production_master_fabrics_specId_placement_seq_key" ON "production_master_fabrics"("specId", "placement", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "production_master_layers_specId_seq_key" ON "production_master_layers"("specId", "seq");

-- AddForeignKey
ALTER TABLE "production_master_fabrics" ADD CONSTRAINT "production_master_fabrics_specId_fkey" FOREIGN KEY ("specId") REFERENCES "production_master_specs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_master_layers" ADD CONSTRAINT "production_master_layers_specId_fkey" FOREIGN KEY ("specId") REFERENCES "production_master_specs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
