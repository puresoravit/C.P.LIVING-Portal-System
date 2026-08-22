import { db } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";

// ==========================================================================
// PRICING ENGINE — หัวใจของระบบ (ข้อ 12, 15, 18, 20, 26)
// แยกเป็น library กลาง ไม่ผูกกับ UI เพื่อให้ Phase 3 (Order Entry) และ
// Phase 4 (Invoice) เรียกใช้ฟังก์ชันเดียวกันได้ ลดความเสี่ยง logic เพี้ยน
// ==========================================================================

/**
 * เช็คว่าช่วงวันที่ 2 ช่วงซ้อนกันไหม (ข้อ 61 Duplicate Prevention)
 * ใช้ตอน validate ก่อนสร้าง Price Rule / Discount Rule ใหม่
 * effectiveTo = null หมายถึง "ไม่มีวันหมดอายุ" (เปิดไปเรื่อยๆ)
 */
export function dateRangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null
): boolean {
  const aEnd = aTo ?? new Date("9999-12-31");
  const bEnd = bTo ?? new Date("9999-12-31");
  return aFrom <= bEnd && bFrom <= aEnd;
}

/**
 * หาราคาตั้งต้น (ก่อนหักส่วนลด) ของสินค้า ตาม Priority (ข้อ 12):
 *   1. Branch Special Price
 *   2. Customer Special Price
 *   3. Product Standard Price
 * อ้างอิงตาม orderDate เสมอ ไม่ใช่วันที่ปัจจุบัน (ข้อ 18)
 * ราคาที่ได้เป็น VAT-inclusive (ยืนยันแล้วในการหารือ)
 */
export async function getEffectivePrice(params: {
  productId: string;
  customerId: string;
  // Owner UAT Fix Batch 1 — ข้อ 3: null = ลูกค้าไม่มีสาขา (หรือเอกสารนี้ไม่ได้ระบุ
  // สาขา) — ข้าม Tier 1 (Branch) ไปเลย ตกลงไปที่ Tier 2 (Customer) ที่มีอยู่แล้วเดิม
  // ไม่มี Business Rule ใหม่ ใช้ Fallback Mechanism เดิมของ DiscountRule/PriceRule
  branchId: string | null;
  orderDate: Date;
}): Promise<{ price: Decimal; source: "BRANCH" | "CUSTOMER" | "STANDARD" }> {
  const { productId, customerId, branchId, orderDate } = params;

  // 1. Branch Special Price (ข้ามถ้าเอกสารนี้ไม่มีสาขา)
  const branchPrice = branchId
    ? await db.priceRule.findFirst({
        where: {
          productId,
          customerId,
          branchId,
          effectiveFrom: { lte: orderDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: orderDate } }],
        },
        orderBy: { effectiveFrom: "desc" },
      })
    : null;
  if (branchPrice) return { price: branchPrice.price, source: "BRANCH" };

  // 2. Customer Special Price (branchId ต้องเป็น null เท่านั้น = apply ทุกสาขา)
  const customerPrice = await db.priceRule.findFirst({
    where: {
      productId,
      customerId,
      branchId: null,
      effectiveFrom: { lte: orderDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: orderDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (customerPrice) return { price: customerPrice.price, source: "CUSTOMER" };

  // 3. Standard Price จาก Product Master
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  return { price: product.standardPrice, source: "STANDARD" };
}

/**
 * หา % ส่วนลด ตาม Priority (ข้อ 15):
 *   1. Branch + Product Type Discount
 *   2. Customer + Product Type Discount (branchId = null)
 *   3. Default 0%
 */
export async function getEffectiveDiscountPct(params: {
  customerId: string;
  // Owner UAT Fix Batch 1 — ข้อ 3: เหมือน getEffectivePrice ทุกประการ
  branchId: string | null;
  productTypeId: string;
  orderDate: Date;
}): Promise<{ discountPct: Decimal; source: "BRANCH" | "CUSTOMER" | "DEFAULT" }> {
  const { customerId, branchId, productTypeId, orderDate } = params;

  const branchDiscount = branchId
    ? await db.discountRule.findFirst({
        where: {
          customerId,
          branchId,
          productTypeId,
          effectiveFrom: { lte: orderDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: orderDate } }],
        },
        orderBy: { effectiveFrom: "desc" },
      })
    : null;
  if (branchDiscount) return { discountPct: branchDiscount.discountPct, source: "BRANCH" };

  const customerDiscount = await db.discountRule.findFirst({
    where: {
      customerId,
      branchId: null,
      productTypeId,
      effectiveFrom: { lte: orderDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: orderDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (customerDiscount) return { discountPct: customerDiscount.discountPct, source: "CUSTOMER" };

  return { discountPct: new Decimal(0), source: "DEFAULT" };
}

/** หา VAT Rate ที่มีผล ณ วันที่กำหนด (ข้อ 26) */
export async function getEffectiveVatRate(onDate: Date): Promise<Decimal> {
  const vat = await db.vatRate.findFirst({
    where: {
      effectiveFrom: { lte: onDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  return vat?.ratePct ?? new Decimal(7.0); // fallback 7% ถ้าไม่มี config (ไม่ควรเกิดขึ้นถ้า seed ถูกต้อง)
}

/**
 * ถอด VAT จากยอดรวม (ราคาสินค้าเป็น VAT-inclusive เสมอ)
 * สูตรที่ยืนยัน: VAT = ยอดรวม × rate ÷ (100+rate)
 * Rounding: ทศนิยม 2 ตำแหน่ง, Round Half Up (ยืนยันแล้ว)
 */
export function extractVat(totalInclusive: Decimal, vatRatePct: Decimal): {
  netBeforeVat: Decimal;
  vatAmount: Decimal;
} {
  const vatAmount = totalInclusive
    .mul(vatRatePct)
    .div(vatRatePct.add(100))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const netBeforeVat = totalInclusive.sub(vatAmount);
  return { netBeforeVat, vatAmount };
}

/** ปัดเศษมาตรฐานของระบบ: ทศนิยม 2 ตำแหน่ง, Round Half Up (ข้อ 26 ยืนยันแล้ว) — ใช้จุดเดียวทั้งระบบ */
export function roundMoney(value: Decimal | number): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * จัดสรรยอด (เช่น discountAmount ของทั้งกลุ่ม) ลงแต่ละ item ตามสัดส่วน
 * โดยรับประกันว่าผลรวมที่จัดสรรแล้วเท่ากับ targetTotal เป๊ะเสมอ — ป้องกัน
 * Rounding Drift ระหว่างยอดรวม Invoice กับผลรวมของ Invoice Item แต่ละ
 * บรรทัด (ข้อ 26 Rounding, ทดสอบใน pricing.test.ts)
 * เทคนิค: ปัดเศษแต่ละรายการตามสัดส่วนก่อน แล้วปรับรายการสุดท้ายให้ดูด
 * เศษที่เหลือทั้งหมด รับประกันผลรวมตรงเป๊ะ
 */
export function allocateProportionally(itemAmounts: Decimal[], targetTotal: Decimal): Decimal[] {
  if (itemAmounts.length === 0) return [];
  const sum = itemAmounts.reduce((s, a) => s.add(a), new Decimal(0));
  if (sum.isZero()) return itemAmounts.map(() => new Decimal(0));

  const allocated = itemAmounts.map((amt) => roundMoney(amt.div(sum).mul(targetTotal)));
  const allocatedSum = allocated.reduce((s, a) => s.add(a), new Decimal(0));
  const drift = targetTotal.sub(allocatedSum);
  allocated[allocated.length - 1] = roundMoney(allocated[allocated.length - 1].add(drift));
  return allocated;
}
