import { db } from "@/lib/db";
import { lineNoteError } from "@/lib/line-note";

// Owner (2026-09-04) — โควตาหมายเหตุต่อบรรทัดของทั้งชุดรายการ (ใช้ตอนแก้ไข Order/ใบเสนอราคา
// ที่ Confirm แล้ว) — ชื่อฐานคือ descriptionOverride (ไซส์พิเศษ = ชื่อรุ่น) หรือ Product.name
export async function findLineNoteError(
  items: { productId: string; descriptionOverride?: string; lineNote?: string }[]
): Promise<string | null> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  for (const it of items) {
    const err = lineNoteError(it.descriptionOverride || nameById.get(it.productId) || "", it.lineNote);
    if (err) return err;
  }
  return null;
}
