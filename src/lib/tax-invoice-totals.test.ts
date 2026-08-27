import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeManualTaxInvoiceTotals } from "./tax-invoice-totals";

// Phase H — ยอดรวมใบกำกับภาษีโหมด MANUAL แบบมีส่วนลด: ลำดับคำนวณต้องเป็น "หักส่วนลด
// ก่อน แล้วถอด VAT จากยอดหลังหักส่วนลด" ตาม Architecture เดิม (extractVat: VAT-inclusive)

describe("computeManualTaxInvoiceTotals", () => {
  it("ไม่มีส่วนลด — เท่าพฤติกรรมเดิมของ createManualTaxInvoice ทุกบาท (gross=net, ถอด VAT จากยอดรวม)", () => {
    const t = computeManualTaxInvoiceTotals(
      [
        { quantity: 2, unitPrice: 1000 },
        { quantity: 1, unitPrice: 500 },
      ],
      new Decimal(7)
    );
    expect(t.grossAmount.toNumber()).toBe(2500);
    expect(t.discountAmount.toNumber()).toBe(0);
    expect(t.netAmount.toNumber()).toBe(2500);
    // VAT = 2500×7÷107 = 163.55 (Round Half Up) — ตรงกับ extractVat เดิม
    expect(t.vatAmount.toNumber()).toBeCloseTo(163.55, 2);
    expect(t.valueAmount.toNumber()).toBeCloseTo(2336.45, 2);
    // ฐานภาษี + VAT = ยอดสุทธิ เสมอ (Invariant ของใบกำกับภาษี)
    expect(t.valueAmount.add(t.vatAmount).toNumber()).toBe(t.netAmount.toNumber());
  });

  it("มีส่วนลด — ถอด VAT จากยอด 'หลังหักส่วนลด' ไม่ใช่ยอดก่อนหัก", () => {
    const t = computeManualTaxInvoiceTotals(
      [
        { quantity: 2, unitPrice: 5000, discountAmount: 500 },
        { quantity: 1, unitPrice: 0, discountAmount: 0 },
      ],
      new Decimal(7)
    );
    expect(t.grossAmount.toNumber()).toBe(10000);
    expect(t.discountAmount.toNumber()).toBe(500);
    expect(t.netAmount.toNumber()).toBe(9500);
    // VAT = 9500×7÷107 = 621.50 — ถ้าเผลอคิดจาก 10000 จะได้ 654.21 (ผิด)
    expect(t.vatAmount.toNumber()).toBeCloseTo(621.5, 2);
    expect(t.valueAmount.toNumber()).toBeCloseTo(8878.5, 2);
    expect(t.valueAmount.add(t.vatAmount).toNumber()).toBe(9500);
  });

  it("อัตรา VAT ไม่ใช่ 7% — คำนวณตามอัตราที่ส่งมาจริง ไม่ Hardcode", () => {
    const t = computeManualTaxInvoiceTotals([{ quantity: 1, unitPrice: 1100, discountAmount: 0 }], new Decimal(10));
    // VAT = 1100×10÷110 = 100
    expect(t.vatAmount.toNumber()).toBe(100);
    expect(t.valueAmount.toNumber()).toBe(1000);
  });

  it("ปัดเศษต่อบรรทัดแบบ Round Half Up เหมือน roundMoney เดิม", () => {
    const t = computeManualTaxInvoiceTotals([{ quantity: 3, unitPrice: 33.335 }], new Decimal(7));
    // 3 × 33.335 = 100.005 → 100.01 (Half Up)
    expect(t.items[0].amount.toNumber()).toBe(100.01);
  });

  it("ส่วนลดติดลบ — ปฏิเสธพร้อมข้อความภาษาไทยระบุบรรทัด", () => {
    expect(() =>
      computeManualTaxInvoiceTotals([{ quantity: 1, unitPrice: 100, discountAmount: -1 }], new Decimal(7))
    ).toThrow(/รายการที่ 1/);
  });

  it("ส่วนลดเกินยอดบรรทัด — ปฏิเสธ", () => {
    expect(() =>
      computeManualTaxInvoiceTotals(
        [
          { quantity: 1, unitPrice: 100, discountAmount: 0 },
          { quantity: 1, unitPrice: 100, discountAmount: 100.01 },
        ],
        new Decimal(7)
      )
    ).toThrow(/รายการที่ 2/);
  });

  it("ส่วนลดเท่ายอดบรรทัดพอดี (ของแถม) — ยอมรับได้ ยอดบรรทัดเป็น 0", () => {
    const t = computeManualTaxInvoiceTotals(
      [
        { quantity: 1, unitPrice: 1000, discountAmount: 0 },
        { quantity: 1, unitPrice: 100, discountAmount: 100 },
      ],
      new Decimal(7)
    );
    expect(t.netAmount.toNumber()).toBe(1000);
    expect(t.discountAmount.toNumber()).toBe(100);
  });

  it("ผลรวมส่วนลดทุกบรรทัด = discountAmount ของเอกสารเสมอ (ไม่มี Drift)", () => {
    const t = computeManualTaxInvoiceTotals(
      [
        { quantity: 1, unitPrice: 333.33, discountAmount: 33.33 },
        { quantity: 1, unitPrice: 333.33, discountAmount: 33.33 },
        { quantity: 1, unitPrice: 333.34, discountAmount: 33.34 },
      ],
      new Decimal(7)
    );
    const sumItems = t.items.reduce((s, i) => s.add(i.discountAmount), new Decimal(0));
    expect(sumItems.toNumber()).toBe(t.discountAmount.toNumber());
    expect(t.netAmount.toNumber()).toBeCloseTo(900, 2);
  });
});

// R11 — โหมด VAT ถอด/เพิ่ม ของใบกำกับภาษี Manual (ตัวเลขตัวอย่างที่ Owner เคาะ)
import { describe as d3, it as it3, expect as ex3 } from "vitest";
import { Decimal as Dec3 } from "@prisma/client/runtime/library";
import { computeManualTaxInvoiceTotals as computeR11 } from "./tax-invoice-totals";

d3("computeManualTaxInvoiceTotals — R11 vatCalcMode", () => {
  it3("EXTRACT (Default เดิม): 1,540 → ฐาน 1,439.25 / VAT 100.75 / สุทธิ 1,540", () => {
    const t = computeR11([{ quantity: 1, unitPrice: 1540 }], new Dec3(7));
    ex3(t.valueAmount.toFixed(2)).toBe("1439.25");
    ex3(t.vatAmount.toFixed(2)).toBe("100.75");
    ex3(t.netAmount.toFixed(2)).toBe("1540.00");
  });

  it3("ADD_ON: 1,540 → ฐาน 1,540 / VAT 107.80 / สุทธิ 1,647.80", () => {
    const t = computeR11([{ quantity: 1, unitPrice: 1540 }], new Dec3(7), "ADD_ON");
    ex3(t.valueAmount.toFixed(2)).toBe("1540.00");
    ex3(t.vatAmount.toFixed(2)).toBe("107.80");
    ex3(t.netAmount.toFixed(2)).toBe("1647.80");
  });

  it3("ADD_ON + ส่วนลด: ฐาน = ยอดหลังหักส่วนลด (ส่วนลดมาก่อน VAT เสมอ)", () => {
    const t = computeR11([{ quantity: 1, unitPrice: 2000, discountAmount: 460 }], new Dec3(7), "ADD_ON");
    ex3(t.valueAmount.toFixed(2)).toBe("1540.00");
    ex3(t.vatAmount.toFixed(2)).toBe("107.80");
    ex3(t.netAmount.toFixed(2)).toBe("1647.80");
  });
});
