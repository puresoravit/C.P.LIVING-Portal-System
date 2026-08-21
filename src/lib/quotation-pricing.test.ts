import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { aggregateQuotationTotals } from "./quotation-pricing";

const items = [
  { grossAmount: new Decimal(1000), discountAmount: new Decimal(100) },
  { grossAmount: new Decimal(500), discountAmount: new Decimal(0) },
];

describe("aggregateQuotationTotals", () => {
  it("vatMode NONE — vatRateSnapshot/vatAmount = 0, grandTotal = ยอดหลังหักส่วนลด", () => {
    const result = aggregateQuotationTotals(items, "NONE", new Decimal(7));
    expect(result.grossAmount.toNumber()).toBe(1500);
    expect(result.discountAmount.toNumber()).toBe(100);
    expect(result.vatRateSnapshot.toNumber()).toBe(0);
    expect(result.vatAmount.toNumber()).toBe(0);
    expect(result.netBeforeVat.toNumber()).toBe(1400);
    expect(result.grandTotal.toNumber()).toBe(1400);
  });

  it("vatMode STANDARD — ถอด VAT จากยอดหลังหักส่วนลด (VAT-inclusive) ด้วยสูตรเดิมของระบบ", () => {
    const result = aggregateQuotationTotals(items, "STANDARD", new Decimal(7));
    // rawAfterDiscount = 1400, VAT = 1400*7/107 = 91.59 (round half up), netBeforeVat = 1308.41
    expect(result.vatRateSnapshot.toNumber()).toBe(7);
    expect(result.vatAmount.toNumber()).toBeCloseTo(91.59, 2);
    expect(result.netBeforeVat.toNumber()).toBeCloseTo(1308.41, 2);
    // grandTotal ต้องเท่ากับยอดก่อนแยก VAT เสมอ (แค่แยกโชว์ ไม่เปลี่ยนยอดรวม)
    expect(result.grandTotal.toNumber()).toBe(1400);
  });

  it("STANDARD ที่ Effective VAT Rate เปลี่ยนไป (ไม่ใช่ 7%) ต้องคำนวณตามอัตราที่ส่งมาจริง ไม่ Hardcode 7", () => {
    const result = aggregateQuotationTotals(items, "STANDARD", new Decimal(10));
    expect(result.vatRateSnapshot.toNumber()).toBe(10);
    // VAT = 1400*10/110 = 127.27
    expect(result.vatAmount.toNumber()).toBeCloseTo(127.27, 2);
    expect(result.grandTotal.toNumber()).toBe(1400);
  });

  it("ไม่มี Item เลย — ทุกยอดเป็น 0 ไม่ Error", () => {
    const result = aggregateQuotationTotals([], "STANDARD", new Decimal(7));
    expect(result.grossAmount.toNumber()).toBe(0);
    expect(result.grandTotal.toNumber()).toBe(0);
    expect(result.vatAmount.toNumber()).toBe(0);
  });
});
