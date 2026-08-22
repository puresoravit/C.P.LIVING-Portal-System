import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { roundMoney } from "@/lib/pricing";
import { generateNextSku } from "@/lib/sku-sequence";

// R6 Phase B — ตารางค่าคงที่ Standard Size สำหรับ Category usesSize=true (เช่นฟูกที่นอน)
// เป็น Single Source of Truth ตัวเดียวของทั้งระบบ (ProductModel Form ตอนสร้าง Variant
// และ /api/products/search ตอนแสดง Size ที่คีย์เอกสารได้ ใช้ตารางนี้ร่วมกัน) ค่าตัวเลข
// (value) ใช้คำนวณราคาเท่านั้น — ไม่เคย Parse จาก String ที่ไหนเลยตามที่อนุมัติ
export const STANDARD_MATTRESS_SIZES: { label: string; value: number }[] = [
  { label: "3 ฟุต", value: 3 },
  { label: "3.5 ฟุต", value: 3.5 },
  { label: "4 ฟุต", value: 4 },
  { label: "5 ฟุต", value: 5 },
  { label: "6 ฟุต", value: 6 },
];

export const CUSTOM_SIZE_LABEL = "ขนาดพิเศษ/ระบุเอง";

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
 */
export async function syncStandardVariants(
  params: { modelId: string; productTypeId: string; categoryId: string | null; pricePerFoot: Decimal; unit: string },
  tx: Prisma.TransactionClient
): Promise<void> {
  const existing = await tx.product.findMany({
    where: { modelId: params.modelId },
    select: { id: true, size: true },
  });
  const existingBySize = new Map(existing.map((p) => [p.size ?? "", p.id]));

  for (const std of STANDARD_MATTRESS_SIZES) {
    const price = computeStandardVariantPrice(params.pricePerFoot, std.value);
    const existingId = existingBySize.get(std.label);
    if (existingId) {
      await tx.product.update({ where: { id: existingId }, data: { standardPrice: price } });
    } else {
      const sku = await generateNextSku(tx);
      await tx.product.create({
        data: {
          sku,
          name: std.label,
          productTypeId: params.productTypeId,
          categoryId: params.categoryId,
          modelId: params.modelId,
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
