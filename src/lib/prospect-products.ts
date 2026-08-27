import { db } from "@/lib/db";
import { resolveAccessHead } from "@/lib/product-company-access";

// ==========================================================================
// R11 (2026-08-27) — สินค้าที่ราย (Prospect) เคยใช้ในใบเสนอราคา และ Head ยังอยู่ใน
// "สินค้าเสนอราคา" — จุดเดียวที่ทั้งหน้ารายละเอียดราย (แสดง Checkbox) และ Action
// สร้างลูกค้าแบบ One-step (นำสินค้าเข้าทั้งหมดอัตโนมัติ) ใช้ร่วมกัน กันตรรกะแตกแถว
// ==========================================================================

export type AdoptableHeads = {
  products: { id: string; sku: string; name: string; sizeVariantCount: number }[];
  models: { id: string; name: string; productCount: number }[];
};

export async function findAdoptableHeadsForProspect(prospectId: string): Promise<AdoptableHeads> {
  const quotations = await db.quotation.findMany({
    where: { prospectId },
    select: { items: { select: { productId: true } } },
  });
  const usedProductIds = [...new Set(quotations.flatMap((q) => q.items.map((i) => i.productId)))];
  if (usedProductIds.length === 0) return { products: [], models: [] };

  const usedProducts = await db.product.findMany({
    where: { id: { in: usedProductIds } },
    select: { id: true, parentProductId: true, modelId: true },
  });
  const heads = usedProducts.map((pr) => resolveAccessHead(pr));
  const headProductIds = [...new Set(heads.filter((h) => h.kind === "product").map((h) => h.id))];
  const headModelIds = [...new Set(heads.filter((h) => h.kind === "model").map((h) => h.id))];

  const [products, models] = await Promise.all([
    headProductIds.length
      ? db.product.findMany({
          where: { id: { in: headProductIds }, catalog: { isQuotationCatalog: true } },
          select: { id: true, sku: true, name: true, _count: { select: { sizeVariants: true } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    headModelIds.length
      ? db.productModel.findMany({
          where: { id: { in: headModelIds }, catalog: { isQuotationCatalog: true } },
          select: { id: true, name: true, _count: { select: { products: true } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return {
    products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, sizeVariantCount: p._count.sizeVariants })),
    models: models.map((m) => ({ id: m.id, name: m.name, productCount: m._count.products })),
  };
}
