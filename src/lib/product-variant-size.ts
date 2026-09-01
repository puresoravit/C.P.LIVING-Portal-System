import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { roundMoney } from "@/lib/pricing";
import { generateNextSku } from "@/lib/sku-sequence";

// Owner UAT (2026-09-02) — STANDARD_MATTRESS_SIZES/CUSTOM_SIZE_LABEL ย้ายไป
// standard-sizes.ts (Client-safe — ไม่ Import db) เพราะ Stable Product Ordering
// (product-line-sort.ts) ต้องใช้จาก Client Component ด้วย — Re-export ที่นี่ให้ผู้ใช้เดิม
// ทุกจุด Import จากที่เดิมได้เหมือนเดิมทุกประการ
import { STANDARD_MATTRESS_SIZES, CUSTOM_SIZE_LABEL } from "@/lib/standard-sizes";

export { STANDARD_MATTRESS_SIZES, CUSTOM_SIZE_LABEL };

export function computeStandardVariantPrice(pricePerFoot: Decimal, value: number): Decimal {
  return roundMoney(pricePerFoot.mul(value));
}

/**
 * R6 Phase B — Sync Standard Variant (3/3.5/4/5/6 ฟุต) ของ ProductModel ตาม pricePerFoot
 * ล่าสุด: สร้าง Variant ที่ยังไม่มี (Auto SKU เดิม) + Recalculate standardPrice ของ
 * Standard Variant ที่มีอยู่แล้วให้ตรง pricePerFoot ใหม่เสมอ (ตามที่ Owner อนุมัติ — ขอบเขต
 * (ข) ชัดเจน: แตะเฉพาะ Product.standardPrice ของ Standard Variant เท่านั้น ไม่แตะ
 * PriceRule/DiscountRule และไม่แตะ Product ที่เป็น "ขนาดพิเศษ" ใดๆ เพราะ Variant พวกนั้น
 * ไม่มีทางมี size ตรงกับ Label ในตารางนี้อยู่แล้ว) ต้องเรียกหลัง update ProductModel เสร็จ
 * ภายใน Transaction เดียวกันเสมอ (ให้ Atomic กับการเปลี่ยน pricePerFoot)
 *
 * Owner UAT — ข้อ 1: ขยายให้ Parent เป็น "Product Anchor" ได้ด้วย (ไม่ใช่แค่ ProductModel)
 * — ส่ง parent: {kind:"model", modelId} แบบเดิมทุกประการ หรือ parent: {kind:"product",
 * productId} สำหรับ Product ที่เป็น Anchor ของตัวเอง — Logic การสร้าง/Recalculate Variant
 * เหมือนเดิมเป๊ะทั้งสองแบบ ต่างกันแค่ Field ไหนที่ผูก FK (modelId vs parentProductId) ชื่อ
 * ที่ตั้งให้ Variant ก็ต่างกันเล็กน้อยตาม Parent Name ที่รับมา (ไม่ Parse จากไหนทั้งสิ้น)
 */
export async function syncStandardVariants(
  params: {
    parent: { kind: "model"; modelId: string } | { kind: "product"; productId: string };
    parentName: string;
    productTypeId: string | null;
    categoryId: string | null;
    pricePerFoot: Decimal;
    unit: string;
  },
  tx: Prisma.TransactionClient
): Promise<void> {
  const where = params.parent.kind === "model" ? { modelId: params.parent.modelId } : { parentProductId: params.parent.productId };
  const existing = await tx.product.findMany({
    where,
    select: { id: true, size: true },
  });
  const existingBySize = new Map(existing.map((p) => [p.size ?? "", p.id]));

  for (const std of STANDARD_MATTRESS_SIZES) {
    const price = computeStandardVariantPrice(params.pricePerFoot, std.value);
    const existingId = existingBySize.get(std.label);
    if (existingId) {
      // Smoke Test (2026-08-25) — Owner พบทั้ง unit และ "กลุ่มส่วนลด/ประเภทสินค้า" ไม่ตาม
      // ตัวหลักลงมาที่ไซส์ที่แตกไว้แล้ว (ราคาตามอยู่ตัวเดียว) — Sync ทุก Field ที่รับมาจาก
      // ตัวหลักให้ครบเหมือนตอน create ด้านล่างทุกตัว ไม่เลือกซิงก์เป็นบาง Field อีก
      await tx.product.update({
        where: { id: existingId },
        data: {
          standardPrice: price,
          unit: params.unit,
          productTypeId: params.productTypeId,
          categoryId: params.categoryId,
          // ชื่อไซส์ = ชื่อตัวหลักเสมอ (Convention เดิมตอน create) — เปลี่ยนชื่อตัวหลักแล้ว
          // ไซส์ต้องตามด้วย ไม่งั้นเอกสารใหม่จะโชว์ชื่อเก่าของไซส์ที่ค้างอยู่
          name: params.parentName,
        },
      });
    } else {
      const sku = await generateNextSku(tx);
      await tx.product.create({
        data: {
          sku,
          // Owner UAT (2026-08-23) — Root Cause ของ "ชื่อสินค้าติดขนาดซ้ำ" บนเอกสาร: เดิม
          // ตั้งชื่อ Variant เป็น `${parentName} ${size}` ทำให้คอลัมน์ "รายการ" (มาจาก
          // Product.name) ซ้ำกับคอลัมน์ "ขนาด" (มาจาก Product.size แยกอยู่แล้ว) ในทุก
          // เอกสาร — แก้ที่ต้นทางนี้: ชื่อ = ชื่อรุ่น/Anchor เดี่ยวๆ ขนาดอยู่ใน Field size
          // ของตัวเองเท่านั้น (หน้า Master ที่ต้องแยกแถว Variant แสดง size ควบคู่เอง —
          // ดู products/page.tsx, prices/page.tsx)
          name: params.parentName,
          productTypeId: params.productTypeId,
          categoryId: params.categoryId,
          modelId: params.parent.kind === "model" ? params.parent.modelId : undefined,
          parentProductId: params.parent.kind === "product" ? params.parent.productId : undefined,
          size: std.label,
          unit: params.unit,
          standardPrice: price,
        },
      });
    }
  }
}

export type SizeOption = {
  productId: string | null;
  sku: string | null;
  unit: string;
  size: string;
  label: string;
  resolved: boolean;
  custom: boolean;
};

/**
 * R6 Phase B — รวม Size ที่เลือกได้ตอนคีย์เอกสารสำหรับ 1 Model: Variant จริงที่มีอยู่แล้ว
 * (resolved:true) รวมกับ Standard Size ที่ยังไม่มี Variant จริง (resolved:false — Edge
 * Case ที่ pricePerFoot ยังไม่เคยตั้ง) และท้ายสุดเพิ่ม "ขนาดพิเศษ/ระบุเอง" เสมอเมื่อ
 * usesSize — Pure Function รับข้อมูลที่ Query มาแล้วเท่านั้น ไม่แตะ DB เอง จึง Unit Test ได้ตรงๆ
 */
export function mergeSizeOptions(
  usesSize: boolean,
  existingVariants: { productId: string; sku: string; unit: string; size: string | null }[]
): SizeOption[] {
  if (!usesSize) {
    return existingVariants.map((v) => ({
      productId: v.productId,
      sku: v.sku,
      unit: v.unit,
      size: v.size ?? "",
      label: v.size ?? "ไม่มีขนาด",
      resolved: true,
      custom: false,
    }));
  }

  const bySize = new Map(existingVariants.map((v) => [v.size ?? "", v]));
  const fallbackUnit = existingVariants[0]?.unit ?? "";

  const options: SizeOption[] = STANDARD_MATTRESS_SIZES.map((std) => {
    const match = bySize.get(std.label);
    return match
      ? { productId: match.productId, sku: match.sku, unit: match.unit, size: std.label, label: std.label, resolved: true, custom: false }
      : { productId: null, sku: null, unit: fallbackUnit, size: std.label, label: std.label, resolved: false, custom: false };
  });

  // Variant ที่มีอยู่จริงแต่ Size ไม่ตรงกับ Standard List (เช่น "ไม่มีขนาด" หรือขนาดพิเศษเดิม
  // ที่เคยพิมพ์ผ่าน Batch Size Tool) ยังต้องเลือกได้เหมือนเดิม ไม่หายไปจาก List
  for (const v of existingVariants) {
    const key = v.size ?? "";
    if (!STANDARD_MATTRESS_SIZES.some((std) => std.label === key)) {
      options.push({ productId: v.productId, sku: v.sku, unit: v.unit, size: key, label: v.size ?? "ไม่มีขนาด", resolved: true, custom: false });
    }
  }

  options.push({ productId: null, sku: null, unit: fallbackUnit, size: "", label: CUSTOM_SIZE_LABEL, resolved: false, custom: true });
  return options;
}

/** R11 (2026-08-27) — ข้อ 6 (Owner): ที่นอนบางรุ่นขาย "ต่อหลัง" ไม่ใช่ต่อฟุต — สร้าง Size
 * Variant พร้อมราคากำหนดเองต่อไซส์ (ไม่ผ่าน pricePerFoot เลย) ใต้ Product Anchor เดียวกัน
 * — Reuse โครง parentProductId + Auto SKU เดิมทั้งหมด จึงเชื่อมกับระบบสร้างเอกสาร/Picker/
 * Pricing (standardPrice ต่อ Variant) โดยอัตโนมัติเหมือน Variant ต่อฟุตทุกประการ —
 * Variant พวกนี้แก้ราคาทีหลังรายตัวได้จากหน้าสินค้า (ไม่ถูก Sync ทับเพราะ Anchor ไม่มี
 * pricePerFoot ให้ syncStandardVariants ทำงาน) */
export async function createManualSizeVariants(
  params: {
    anchorProductId: string;
    parentName: string;
    productTypeId: string | null;
    categoryId: string | null;
    unit: string;
    sizes: { size: string; price: Decimal }[];
  },
  tx: Prisma.TransactionClient
): Promise<number> {
  let created = 0;
  for (const row of params.sizes) {
    const size = row.size.trim();
    if (!size) continue;
    const sku = await generateNextSku(tx);
    await tx.product.create({
      data: {
        sku,
        name: params.parentName,
        size,
        unit: params.unit,
        standardPrice: roundMoney(row.price),
        productTypeId: params.productTypeId,
        categoryId: params.categoryId,
        parentProductId: params.anchorProductId,
      },
    });
    created++;
  }
  return created;
}
