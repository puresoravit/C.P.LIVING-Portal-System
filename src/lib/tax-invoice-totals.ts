import { Decimal } from "@prisma/client/runtime/library";
import { extractVat, roundMoney } from "@/lib/pricing";

// ==========================================================================
// Phase H — ยอดรวมใบกำกับภาษี (โหมด MANUAL) แบบมีส่วนลด — Pure Function แยกออกมา
// เพื่อ Unit Test ตรงๆ (Pattern เดียวกับ aggregateQuotationTotals) — Reuse extractVat/
// roundMoney เดิมของระบบ 100% ไม่มีสูตร VAT/Rounding ใหม่:
//   gross(VAT-inc) = Σ round(qty × unitPrice)
//   discount(VAT-inc) = Σ discount ต่อบรรทัด (กรอกเอง/ตาม Discount Group)
//   net(VAT-inc) = gross − discount  → คือยอดจ่ายจริง (= TaxInvoice.netAmount)
//   { valueAmount, vatAmount } = extractVat(net, vatPct)  ← สูตรถอด VAT เดิมเป๊ะ
// ลำดับคำนวณ "หักส่วนลดก่อน แล้วค่อยถอด VAT จากยอดหลังหักส่วนลด" ตรงกับ
// aggregateQuotationTotals (Quotation) และ createTaxInvoiceFromInvoice (AUTO) ที่ถอด
// VAT จาก invoice.grandTotal ซึ่งเป็นยอดหลังหักส่วนลดอยู่แล้ว — สอดคล้องทั้งระบบ
// ==========================================================================

export type ManualTaxInvoiceItemInput = {
  quantity: Decimal | number;
  unitPrice: Decimal | number;
  discountAmount?: Decimal | number | null;
};

export type ManualTaxInvoiceItemTotal = {
  amount: Decimal; // qty × unitPrice (ก่อนหักส่วนลดบรรทัด)
  discountAmount: Decimal;
};

export type ManualTaxInvoiceTotals = {
  items: ManualTaxInvoiceItemTotal[];
  grossAmount: Decimal;
  discountAmount: Decimal;
  netAmount: Decimal; // ยอดจ่ายจริง VAT-inclusive หลังหักส่วนลด
  valueAmount: Decimal; // ฐานภาษีก่อน VAT
  vatAmount: Decimal;
};

/**
 * คำนวณยอดรวมใบกำกับภาษีโหมด MANUAL — throw Error ข้อความภาษาไทยเมื่อส่วนลดไม่
 * สมเหตุสมผล (ติดลบ หรือเกินยอดบรรทัด/ยอดเอกสาร) ให้ Server Action จับไปแสดงผลตรงๆ
 */
export function computeManualTaxInvoiceTotals(
  rawItems: ManualTaxInvoiceItemInput[],
  vatPct: Decimal
): ManualTaxInvoiceTotals {
  const items: ManualTaxInvoiceItemTotal[] = rawItems.map((raw, idx) => {
    const amount = roundMoney(new Decimal(raw.quantity).mul(raw.unitPrice));
    const discountAmount = roundMoney(new Decimal(raw.discountAmount ?? 0));
    if (discountAmount.isNegative()) {
      throw new Error(`ส่วนลดของรายการที่ ${idx + 1} ติดลบไม่ได้`);
    }
    if (discountAmount.gt(amount)) {
      throw new Error(`ส่วนลดของรายการที่ ${idx + 1} เกินจำนวนเงินของรายการนั้น`);
    }
    return { amount, discountAmount };
  });

  const grossAmount = roundMoney(items.reduce((s, i) => s.add(i.amount), new Decimal(0)));
  const discountAmount = roundMoney(items.reduce((s, i) => s.add(i.discountAmount), new Decimal(0)));
  const netAmount = roundMoney(grossAmount.sub(discountAmount));
  if (netAmount.isNegative()) {
    throw new Error("ส่วนลดรวมเกินยอดรวมของเอกสาร");
  }

  const { netBeforeVat, vatAmount } = extractVat(netAmount, vatPct);
  return { items, grossAmount, discountAmount, netAmount, valueAmount: netBeforeVat, vatAmount };
}
