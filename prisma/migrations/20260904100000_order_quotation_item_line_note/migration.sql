-- Owner (2026-09-04) — หมายเหตุต่อรายการ (แสดงในวงเล็บต่อท้ายชื่อสินค้า) — Additive อย่างเดียว
ALTER TABLE "order_items" ADD COLUMN "lineNote" TEXT;
ALTER TABLE "quotation_items" ADD COLUMN "lineNote" TEXT;
