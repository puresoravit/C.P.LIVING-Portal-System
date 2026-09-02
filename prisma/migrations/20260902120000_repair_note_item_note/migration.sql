-- Owner (2026-09-02) — หมายเหตุต่อรายการในใบส่งคืนสินค้าฝากซ่อม (additive nullable เท่านั้น)
ALTER TABLE "repair_return_note_items" ADD COLUMN "note" TEXT;
