import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEffectivePrice, getEffectiveDiscountPct, getEffectiveVatRate, extractVat, roundMoney } from "@/lib/pricing";
import { UNSPECIFIED_TYPE_LABEL } from "@/lib/order-preview";

export type QuotationVatModeValue = "NONE" | "STANDARD";

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
  rawItems: { productId: string; quantity: Decimal | number; descriptionOverride?: string | null }[],
  params: {
    customerId: string;
    branchId: string;
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
    const { price } = await getEffectivePrice({
      productId: raw.productId,
      customerId: params.customerId,
      branchId: params.branchId,
      orderDate: params.quotationDate,
    });
    // R3 — applyDiscount=false ข้าม getEffectiveDiscountPct ไปเลย (ไม่ query DiscountRule)
    // แล้วบังคับ discountPct=0 ที่ต้นทาง แทนที่จะ Query แล้วค่อย Override ทีหลัง
    // R4 — product.productTypeId=null (ไม่ระบุประเภท) ก็ข้ามเช่นกัน เพราะ DiscountRule.
    // productTypeId ยัง required เสมอ ไม่มีทาง Match ได้จริงอยู่แล้ว (ข้อเท็จจริงเชิง
    // โครงสร้าง ไม่ใช่ Policy)
    const discountPct =
      params.applyDiscount && product.productTypeId
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
      sizeSnapshot: product.size,
      unitSnapshot: product.unit,
      unitPriceSnapshot: price,
      grossAmount,
      discountAmount,
      netAmount,
    });
  }

  const effectiveVatRate = params.vatMode === "STANDARD" ? await getEffectiveVatRate(params.quotationDate) : new Decimal(0);
  const totals = aggregateQuotationTotals(items, params.vatMode, effectiveVatRate);

  return { items, ...totals };
}
