import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEffectivePrice, getEffectiveDiscountPct, getEffectiveVatRate, extractVat, roundMoney } from "@/lib/pricing";
import { UNSPECIFIED_TYPE_LABEL } from "@/lib/order-preview";

// R11 (2026-08-27) — Owner เคาะสูตรชัดเจน (ส่วนลดหักก่อน VAT เสมอทั้งสองโหมด):
//   STANDARD ("ถอด VAT จากราคาขาย"): ยอดขาย 1,540 → ฐาน 1,439.25 / VAT 100.75 / สุทธิ 1,540 (ไม่เปลี่ยน)
//   ADD_ON  ("เพิ่ม VAT จากราคาขาย"): ยอดขาย 1,540 → ฐาน 1,540 / VAT 107.80 / สุทธิ 1,647.80
export type QuotationVatModeValue = "NONE" | "STANDARD" | "ADD_ON";

export type QuotationItemCalc = {
  productId: string;
  quantity: Decimal;
  descriptionOverride: string | null;
  skuSnapshot: string;
  productNameSnapshot: string;
  productTypeSnapshot: string;
  sizeSnapshot: string | null;
  unitSnapshot: string;
  unitPriceSnapshot: Decimal;
  grossAmount: Decimal;
  discountAmount: Decimal;
  netAmount: Decimal;
};

export type QuotationTotals = {
  grossAmount: Decimal;
  discountAmount: Decimal;
  vatRateSnapshot: Decimal;
  netBeforeVat: Decimal;
  vatAmount: Decimal;
  grandTotal: Decimal;
};

export type QuotationCalc = QuotationTotals & { items: QuotationItemCalc[] };

/**
 * รวมยอด Header จาก Item ที่คำนวณราคา/ส่วนลดต่อบรรทัดไว้แล้ว + ตัดสินใจ VAT ตาม
 * vatMode — เป็น Pure Function (ไม่แตะ DB) เพื่อ unit test ได้ตรงๆ — Reuse extractVat()
 * เดิมของระบบเป๊ะ ไม่มีสูตร VAT ใหม่ (ราคาสินค้าทุกระดับเป็น VAT-inclusive เสมอตาม
 * Convention เดิม — vatMode=STANDARD คือ "ถอด VAT ออกมาโชว์" ไม่ใช่ "บวก VAT เพิ่ม")
 */
export function aggregateQuotationTotals(
  items: { grossAmount: Decimal; discountAmount: Decimal }[],
  vatMode: QuotationVatModeValue,
  effectiveVatRate: Decimal
): QuotationTotals {
  const grossAmount = roundMoney(items.reduce((s, i) => s.add(i.grossAmount), new Decimal(0)));
  const discountAmount = roundMoney(items.reduce((s, i) => s.add(i.discountAmount), new Decimal(0)));
  const rawAfterDiscount = roundMoney(grossAmount.sub(discountAmount));

  if (vatMode === "STANDARD") {
    const { netBeforeVat, vatAmount } = extractVat(rawAfterDiscount, effectiveVatRate);
    return {
      grossAmount,
      discountAmount,
      vatRateSnapshot: effectiveVatRate,
      netBeforeVat,
      vatAmount,
      grandTotal: roundMoney(netBeforeVat.add(vatAmount)),
    };
  }

  if (vatMode === "ADD_ON") {
    // R11 — บวก VAT เพิ่มจากยอดขายหลังหักส่วนลด: ฐาน = ยอดหลังส่วนลด, VAT = ฐาน × อัตรา
    // ÷ 100 (Round Half Up เดิม), ยอดรวม = ฐาน + VAT (ยอดรวมเพิ่มขึ้น)
    const vatAmount = roundMoney(rawAfterDiscount.mul(effectiveVatRate).div(100));
    return {
      grossAmount,
      discountAmount,
      vatRateSnapshot: effectiveVatRate,
      netBeforeVat: rawAfterDiscount,
      vatAmount,
      grandTotal: roundMoney(rawAfterDiscount.add(vatAmount)),
    };
  }

  return {
    grossAmount,
    discountAmount,
    vatRateSnapshot: new Decimal(0),
    netBeforeVat: rawAfterDiscount,
    vatAmount: new Decimal(0),
    grandTotal: rawAfterDiscount,
  };
}

/**
 * คำนวณ Snapshot ทั้งชุดของ Quotation จาก Item ดิบ (productId+quantity) — ใช้ทั้งตอน
 * Preview สด (DRAFT, ไม่ persist) และตอน Confirm/Revision (persist ผลลัพธ์นี้ลง Snapshot
 * fields จริง) Reuse Pricing Engine เดิม (getEffectivePrice/getEffectiveDiscountPct)
 * ทั้งหมด — ไม่แยกกลุ่มตาม ProductType เหมือน Order เพราะ Quotation เป็นเอกสารเดียว
 * ไม่แตกเป็นหลายใบ
 */
export async function computeQuotationCalc(
  rawItems: {
    productId: string;
    quantity: Decimal | number;
    descriptionOverride?: string | null;
    sizeOverride?: string | null;
    unitPriceOverride?: Decimal | number | null;
  }[],
  params: {
    // Phase H — Guest Customer: null = ลูกค้าที่กรอกเองไม่มีใน Master → ไม่มีทาง Match
    // PriceRule/DiscountRule ใดๆ (Rule ทุกตัวผูก customerId เสมอ — ข้อเท็จจริงเชิงโครงสร้าง)
    // จึงข้าม Engine ไปใช้ Standard Price ตรงๆ และ discountPct=0 โดยไม่ Query เลย
    customerId: string | null;
    // Owner UAT Fix Batch 1 — ข้อ 3: เหมือน pricing.ts ทุกประการ
    branchId: string | null;
    quotationDate: Date;
    vatMode: QuotationVatModeValue;
    applyDiscount: boolean;
  },
  client: Prisma.TransactionClient | typeof db = db
): Promise<QuotationCalc> {
  const items: QuotationItemCalc[] = [];

  for (const raw of rawItems) {
    const product = await client.product.findUniqueOrThrow({
      where: { id: raw.productId },
      include: { productType: true },
    });
    const quantity = new Decimal(raw.quantity);
    // R6 Phase B — "ขนาดพิเศษ/ระบุเอง": unitPriceOverride ใช้แทน Pricing Engine ทั้งหมด
    // (เหมือน Order ทุกประการ — ดู order-preview.ts) ไม่กระทบ Pricing Priority เดิม
    const price =
      raw.unitPriceOverride != null
        ? new Decimal(raw.unitPriceOverride)
        : params.customerId == null
          ? product.standardPrice // Guest — Tier 3 (Standard) ตรงๆ ตาม Priority เดิม
          : (
              await getEffectivePrice({
                productId: raw.productId,
                customerId: params.customerId,
                branchId: params.branchId,
                orderDate: params.quotationDate,
              })
            ).price;
    // R3 — applyDiscount=false ข้าม getEffectiveDiscountPct ไปเลย (ไม่ query DiscountRule)
    // แล้วบังคับ discountPct=0 ที่ต้นทาง แทนที่จะ Query แล้วค่อย Override ทีหลัง
    // R4 — product.productTypeId=null (ไม่ระบุประเภท) ก็ข้ามเช่นกัน เพราะ DiscountRule.
    // productTypeId ยัง required เสมอ ไม่มีทาง Match ได้จริงอยู่แล้ว (ข้อเท็จจริงเชิง
    // โครงสร้าง ไม่ใช่ Policy)
    const discountPct =
      params.applyDiscount && product.productTypeId && params.customerId != null
        ? (
            await getEffectiveDiscountPct({
              customerId: params.customerId,
              branchId: params.branchId,
              productTypeId: product.productTypeId,
              orderDate: params.quotationDate,
            })
          ).discountPct
        : new Decimal(0);
    const grossAmount = roundMoney(quantity.mul(price));
    const discountAmount = roundMoney(grossAmount.mul(discountPct).div(100));
    const netAmount = roundMoney(grossAmount.sub(discountAmount));

    items.push({
      productId: raw.productId,
      quantity,
      descriptionOverride: raw.descriptionOverride ?? null,
      skuSnapshot: product.sku,
      productNameSnapshot: raw.descriptionOverride || product.name,
      productTypeSnapshot: product.productType?.name ?? UNSPECIFIED_TYPE_LABEL,
      sizeSnapshot: raw.sizeOverride || product.size,
      unitSnapshot: product.unit,
      unitPriceSnapshot: price,
      grossAmount,
      discountAmount,
      netAmount,
    });
  }

  const effectiveVatRate = params.vatMode !== "NONE" ? await getEffectiveVatRate(params.quotationDate) : new Decimal(0);
  const totals = aggregateQuotationTotals(items, params.vatMode, effectiveVatRate);

  return { items, ...totals };
}
