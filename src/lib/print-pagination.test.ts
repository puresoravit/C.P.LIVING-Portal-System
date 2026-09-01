import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  estimateRowHeightMm,
  estimatePageCapacity,
  capacityForDocument,
  paginateRows,
  computeItemsPageSummary,
  computeQuotationPageSummary,
  computeTaxInvoicePageSummary,
  computeBillingNotePageSummary,
  DOC_PAGE_RESERVES_MM,
  type PageCapacity,
} from "./print-pagination";
import { DEFAULT_GLOBAL_TEMPLATE_SETTINGS } from "./print-template-settings";

// R8 — Document Pagination: Invariant สำคัญที่สุดคือ Zero Regression ของเอกสารหน้าเดียว
// (รายการน้อย = หน้าเดียว Output โครงเดิม) และผลรวม Summary ทุกหน้า = ยอดเอกสารเสมอ

describe("estimatePageCapacity / capacityForDocument", () => {
  it("ค่า Default Template (12px/4px) ได้ความจุสมเหตุสมผล และ finalOfMulti ≤ normal เสมอ", () => {
    for (const kind of Object.keys(DOC_PAGE_RESERVES_MM) as (keyof typeof DOC_PAGE_RESERVES_MM)[]) {
      const cap = estimatePageCapacity({
        bodyFontSizePx: 12,
        rowPaddingPx: 4,
        contentPaddingMm: 0,
        headerHeightMm: 52,
        ...DOC_PAGE_RESERVES_MM[kind],
      });
      expect(cap.normalPageRows).toBeGreaterThanOrEqual(10); // 9×11 ควรจุเกิน 10 แถวเสมอ
      expect(cap.finalAloneRows).toBeGreaterThanOrEqual(1);
      expect(cap.finalOfMultiRows).toBeGreaterThanOrEqual(1);
      expect(cap.finalOfMultiRows).toBeLessThanOrEqual(cap.normalPageRows);
      // finalAlone ไม่มีกล่องรวมหน้านี้ จึงต้อง ≥ finalOfMulti เสมอ
      expect(cap.finalAloneRows).toBeGreaterThanOrEqual(cap.finalOfMultiRows);
    }
  });

  it("Header สูงขึ้น = ความจุลดลง (Monotonic)", () => {
    const base = {
      bodyFontSizePx: 12,
      rowPaddingPx: 4,
      contentPaddingMm: 0,
      pageSummaryMm: 24,
      finalFooterMm: 50,
      signatureEverySheetMm: 25,
    };
    const small = estimatePageCapacity({ ...base, headerHeightMm: 40 });
    const big = estimatePageCapacity({ ...base, headerHeightMm: 90 });
    expect(big.normalPageRows).toBeLessThan(small.normalPageRows);
  });

  it("capacityForDocument ใช้ Template Default ได้โดยไม่ Throw (ทุกประเภทเอกสาร)", () => {
    for (const kind of ["QUOTATION", "INVOICE", "TAX_INVOICE", "BILLING_NOTE", "REPAIR_NOTE"] as const) {
      const cap = capacityForDocument(DEFAULT_GLOBAL_TEMPLATE_SETTINGS, kind);
      expect(cap.normalPageRows).toBeGreaterThan(0);
    }
  });

  // Owner Approve (2026-09-02) — Invoice ใช้ความจุที่ Owner เคาะจาก Physical Print ตรงๆ
  it("INVOICE ใช้ค่า Owner-approved (17/14/14) ไม่ใช่สูตรประมาณ", () => {
    const cap = capacityForDocument(DEFAULT_GLOBAL_TEMPLATE_SETTINGS, "INVOICE");
    expect(cap).toEqual({ normalPageRows: 17, finalAloneRows: 14, finalOfMultiRows: 14 });
  });

  // Owner UAT (2026-08-31) — Invoice Boost ฟอนต์ +30% ผ่าน CSS ล้วนๆ นอกระบบ Template
  // Settings ปกติ — fontScaleMultiplier ≠ 1 ทำให้ค่าที่วัดไว้ใช้ไม่ได้ ต้อง Fallback ไป
  // สูตรประมาณ (และความจุลดลงตามฟอนต์ที่ใหญ่ขึ้น)
  it("fontScaleMultiplier ≠ 1: Fallback ไปสูตรประมาณ และความจุลดลงตามฟอนต์", () => {
    const approved = capacityForDocument(DEFAULT_GLOBAL_TEMPLATE_SETTINGS, "INVOICE");
    const boosted = capacityForDocument(DEFAULT_GLOBAL_TEMPLATE_SETTINGS, "INVOICE", 1.3);
    expect(boosted.normalPageRows).toBeLessThan(approved.normalPageRows);
  });

  it("fontScaleMultiplier ไม่ส่ง = 1 = พฤติกรรมเดิมทุกประการ", () => {
    const a = capacityForDocument(DEFAULT_GLOBAL_TEMPLATE_SETTINGS, "INVOICE");
    const b = capacityForDocument(DEFAULT_GLOBAL_TEMPLATE_SETTINGS, "INVOICE", 1);
    expect(b).toEqual(a);
  });

  it("ความจุไม่ต่ำกว่า 1 แม้ Header/ส่วนสงวนใหญ่ผิดปกติ (เอกสารต้องพิมพ์ได้เสมอ)", () => {
    const cap = estimatePageCapacity({
      bodyFontSizePx: 13,
      rowPaddingPx: 6,
      contentPaddingMm: 4,
      headerHeightMm: 240,
      pageSummaryMm: 40,
      finalFooterMm: 80,
      signatureEverySheetMm: 25,
    });
    expect(cap.normalPageRows).toBeGreaterThanOrEqual(1);
    expect(cap.finalAloneRows).toBeGreaterThanOrEqual(1);
    expect(cap.finalOfMultiRows).toBeGreaterThanOrEqual(1);
  });

  it("estimateRowHeightMm: Font/Padding ใหญ่ขึ้น = แถวสูงขึ้น", () => {
    expect(estimateRowHeightMm(13, 6)).toBeGreaterThan(estimateRowHeightMm(11, 2));
  });
});

describe("paginateRows", () => {
  const cap: PageCapacity = { normalPageRows: 10, finalAloneRows: 8, finalOfMultiRows: 6 };
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("เอกสารไม่มีรายการ = หน้าเดียวว่าง (โครงหน้าจอเดิม)", () => {
    expect(paginateRows([], cap)).toEqual([[]]);
  });

  it("รายการ ≤ finalAloneRows = หน้าเดียวเสมอ (Full Footer ไม่มีกล่องรวมหน้านี้)", () => {
    expect(paginateRows(rows(6), cap)).toEqual([rows(6)]);
    expect(paginateRows(rows(8), cap)).toEqual([rows(8)]);
  });

  it("เกิน finalAloneRows 1 แถว = แตกเป็น 2 หน้า (หน้าสุดท้าย ≤ finalOfMultiRows)", () => {
    const pages = paginateRows(rows(9), cap);
    expect(pages.length).toBe(2);
    expect(pages[0].length).toBeLessThanOrEqual(cap.normalPageRows);
    expect(pages[1].length).toBeLessThanOrEqual(cap.finalOfMultiRows);
    expect(pages[1].length).toBeGreaterThan(0);
  });

  it("ครบทุกแถว เรียงลำดับเดิม ไม่ซ้ำไม่หาย (หลายขนาด)", () => {
    for (const n of [1, 6, 8, 9, 10, 16, 17, 25, 40, 100]) {
      const pages = paginateRows(rows(n), cap);
      expect(pages.flat()).toEqual(rows(n));
      if (pages.length === 1) {
        expect(pages[0].length).toBeLessThanOrEqual(cap.finalAloneRows);
      } else {
        for (let i = 0; i < pages.length - 1; i++) expect(pages[i].length).toBeLessThanOrEqual(cap.normalPageRows);
        expect(pages[pages.length - 1].length).toBeLessThanOrEqual(cap.finalOfMultiRows);
        expect(pages[pages.length - 1].length).toBeGreaterThan(0);
      }
    }
  });

  it("finalAlone > normal ได้โดยชอบ (หน้าเดียวไม่มีกล่องรวมหน้านี้) — n ≤ finalAlone ยังหน้าเดียว", () => {
    const wide: PageCapacity = { normalPageRows: 12, finalAloneRows: 13, finalOfMultiRows: 10 };
    expect(paginateRows(rows(13), wide).length).toBe(1);
  });

  it("normal = finalOfMulti (ส่วนสงวนเท่ากัน) ยังแบ่งถูกต้อง", () => {
    const eq: PageCapacity = { normalPageRows: 5, finalAloneRows: 5, finalOfMultiRows: 5 };
    const pages = paginateRows(rows(12), eq);
    expect(pages.flat()).toEqual(rows(12));
    expect(pages.map((p) => p.length)).toEqual([5, 5, 2]);
  });
});

// Owner Approve (2026-09-02) — Pagination Matrix ของ Invoice ที่ Owner สั่งให้พิสูจน์ตรงๆ
// (ความจุ 17/14/14): 1–14 = หน้าเดียว Full Footer / 15 ขึ้นไป = Multi-sheet ห้ามยัด 15
// ในหน้าเดียวด้วยการขยับ Footer / หน้าแรก-กลางใช้พื้นที่ได้ ~17 แถว / หน้าสุดท้ายเหลือ
// พื้นที่ Full Footer ตำแหน่ง LOCK เสมอ
describe("paginateRows — Owner-approved Invoice matrix (17/14/14)", () => {
  const invoiceCap: PageCapacity = { normalPageRows: 17, finalAloneRows: 14, finalOfMultiRows: 14 };
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i);
  const shape = (n: number) => paginateRows(rows(n), invoiceCap).map((p) => p.length);

  it("1–14 รายการ = Single-page Invoice เสมอ", () => {
    for (let n = 1; n <= 14; n++) expect(shape(n)).toEqual([n]);
  });

  it("15 รายการ = Multi-sheet (ห้ามยัดหน้าเดียว)", () => {
    expect(shape(15)).toEqual([14, 1]);
  });

  it("Matrix ตามที่ Owner สั่งพิสูจน์: 17/18/20/28/35", () => {
    expect(shape(17)).toEqual([16, 1]);
    expect(shape(18)).toEqual([17, 1]);
    expect(shape(20)).toEqual([17, 3]);
    expect(shape(28)).toEqual([17, 11]);
    expect(shape(35)).toEqual([17, 17, 1]);
  });

  it("หน้าสุดท้ายไม่เกิน finalOfMulti(14) และหน้าแรก/กลางไม่เกิน 17 เสมอ (กวาด 15–60)", () => {
    for (let n = 15; n <= 60; n++) {
      const pages = shape(n);
      expect(pages.reduce((a, b) => a + b, 0)).toBe(n);
      for (let i = 0; i < pages.length - 1; i++) expect(pages[i]).toBeLessThanOrEqual(17);
      expect(pages[pages.length - 1]).toBeLessThanOrEqual(14);
      expect(pages[pages.length - 1]).toBeGreaterThan(0);
    }
  });
});

describe("per-page summaries — ผลรวมทุกหน้าต้องเท่ายอดเอกสาร", () => {
  it("computeItemsPageSummary: gross = net + discount ต่อหน้า และรวมทุกหน้า = ทั้งเอกสาร", () => {
    const items = [
      { netAmount: new Decimal("90.00"), discountAmount: new Decimal("10.00") },
      { netAmount: new Decimal("250.50"), discountAmount: new Decimal("0") },
      { netAmount: new Decimal("59.25"), discountAmount: new Decimal("5.75") },
    ];
    const all = computeItemsPageSummary(items);
    expect(all.gross).toBeCloseTo(415.5, 2);
    expect(all.discount).toBeCloseTo(15.75, 2);
    expect(all.net).toBeCloseTo(399.75, 2);

    const page1 = computeItemsPageSummary(items.slice(0, 2));
    const page2 = computeItemsPageSummary(items.slice(2));
    expect(page1.net + page2.net).toBeCloseTo(all.net, 2);
    expect(page1.gross + page2.gross).toBeCloseTo(all.gross, 2);
    expect(page1.discount + page2.discount).toBeCloseTo(all.discount, 2);
  });

  it("computeQuotationPageSummary: ถอด VAT 7% จากยอดสุทธิของหน้า (Round Half Up เดิม)", () => {
    const items = [{ netAmount: new Decimal("107.00"), discountAmount: new Decimal("0") }];
    const s = computeQuotationPageSummary(items, new Decimal(7));
    expect(s.net).toBeCloseTo(107, 2);
    expect(s.vatAmount).toBeCloseTo(7, 2); // 107×7/107 = 7
    expect(s.netBeforeVat).toBeCloseTo(100, 2);
    expect(s.netBeforeVat + s.vatAmount).toBeCloseTo(s.net, 2);
  });

  it("computeTaxInvoicePageSummary: net = subtotal − discount แล้วถอด VAT (สูตร computeManualTaxInvoiceTotals)", () => {
    const items = [
      { amount: new Decimal("100.00"), discountAmount: new Decimal("10.00") },
      { amount: new Decimal("60.90"), discountAmount: undefined },
    ];
    const s = computeTaxInvoicePageSummary(items, new Decimal(7));
    expect(s.subtotal).toBeCloseTo(160.9, 2);
    expect(s.discount).toBeCloseTo(10, 2);
    expect(s.net).toBeCloseTo(150.9, 2);
    // extractVat(150.90, 7) = 150.90×7/107 = 9.8716... → 9.87 (Round Half Up)
    expect(s.vatAmount).toBeCloseTo(9.87, 2);
    expect(s.valueAmount).toBeCloseTo(141.03, 2);
    expect(s.valueAmount + s.vatAmount).toBeCloseTo(s.net, 2);
  });

  it("computeBillingNotePageSummary: รวมยอดใบ + ส่วนลดต่อใบ (ใบไม่มีส่วนลด = 0)", () => {
    const rows = [
      { grandTotal: new Decimal("1000.00"), discountAmount: 100 },
      { grandTotal: new Decimal("500.00"), discountAmount: undefined },
    ];
    const s = computeBillingNotePageSummary(rows);
    expect(s.gross).toBeCloseTo(1500, 2);
    expect(s.discount).toBeCloseTo(100, 2);
    expect(s.net).toBeCloseTo(1400, 2);
  });
});

// R11 — Summary ต่อหน้าโหมด ADD_ON (เอกสารหลายหน้าโหมดเพิ่ม VAT ต้องคิดต่อหน้าให้ถูกทาง)
describe("per-page summaries — R11 VAT ADD_ON", () => {
  it("computeQuotationPageSummary ADD_ON: ฐาน = ยอดหน้า, VAT = ฐาน×7%, net = ฐาน+VAT", () => {
    const s = computeQuotationPageSummary(
      [{ netAmount: new Decimal("1540.00"), discountAmount: new Decimal("0") }],
      new Decimal(7),
      "ADD_ON"
    );
    expect(s.netBeforeVat).toBeCloseTo(1540, 2);
    expect(s.vatAmount).toBeCloseTo(107.8, 2);
    expect(s.net).toBeCloseTo(1647.8, 2);
  });

  it("computeTaxInvoicePageSummary ADD_ON: เหมือนกัน (หักส่วนลดก่อน)", () => {
    const s = computeTaxInvoicePageSummary(
      [{ amount: new Decimal("2000.00"), discountAmount: new Decimal("460.00") }],
      new Decimal(7),
      "ADD_ON"
    );
    expect(s.valueAmount).toBeCloseTo(1540, 2);
    expect(s.vatAmount).toBeCloseTo(107.8, 2);
    expect(s.net).toBeCloseTo(1647.8, 2);
  });
});
