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
  it("ค่า Default Template (12px/4px) ได้ความจุสมเหตุสมผล และ last ≤ normal เสมอ", () => {
    for (const kind of Object.keys(DOC_PAGE_RESERVES_MM) as (keyof typeof DOC_PAGE_RESERVES_MM)[]) {
      const cap = estimatePageCapacity({
        bodyFontSizePx: 12,
        rowPaddingPx: 4,
        contentPaddingMm: 0,
        headerHeightMm: 52,
        ...DOC_PAGE_RESERVES_MM[kind],
      });
      expect(cap.normalPageRows).toBeGreaterThanOrEqual(10); // 9×11 ควรจุเกิน 10 แถวเสมอ
      expect(cap.lastPageRows).toBeGreaterThanOrEqual(1);
      expect(cap.lastPageRows).toBeLessThanOrEqual(cap.normalPageRows);
    }
  });

  it("Header สูงขึ้น = ความจุลดลง (Monotonic)", () => {
    const base = { bodyFontSizePx: 12, rowPaddingPx: 4, contentPaddingMm: 0, pageSummaryMm: 24, lastPageExtraMm: 50 };
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

  it("ความจุไม่ต่ำกว่า 1 แม้ Header/ส่วนสงวนใหญ่ผิดปกติ (เอกสารต้องพิมพ์ได้เสมอ)", () => {
    const cap = estimatePageCapacity({
      bodyFontSizePx: 13,
      rowPaddingPx: 6,
      contentPaddingMm: 4,
      headerHeightMm: 240,
      pageSummaryMm: 40,
      lastPageExtraMm: 80,
    });
    expect(cap.normalPageRows).toBeGreaterThanOrEqual(1);
    expect(cap.lastPageRows).toBeGreaterThanOrEqual(1);
  });

  it("estimateRowHeightMm: Font/Padding ใหญ่ขึ้น = แถวสูงขึ้น", () => {
    expect(estimateRowHeightMm(13, 6)).toBeGreaterThan(estimateRowHeightMm(11, 2));
  });
});

describe("paginateRows", () => {
  const cap: PageCapacity = { normalPageRows: 10, lastPageRows: 6 };
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("เอกสารไม่มีรายการ = หน้าเดียวว่าง (โครงหน้าจอเดิม)", () => {
    expect(paginateRows([], cap)).toEqual([[]]);
  });

  it("รายการ ≤ ความจุหน้าสุดท้าย = หน้าเดียว (Zero Regression)", () => {
    expect(paginateRows(rows(6), cap)).toEqual([rows(6)]);
  });

  it("เกินความจุหน้าสุดท้าย 1 แถว = แตกเป็น 2 หน้า", () => {
    const pages = paginateRows(rows(7), cap);
    expect(pages.length).toBe(2);
    expect(pages[0].length).toBeLessThanOrEqual(cap.normalPageRows);
    expect(pages[1].length).toBeLessThanOrEqual(cap.lastPageRows);
    expect(pages[1].length).toBeGreaterThan(0);
  });

  it("ครบทุกแถว เรียงลำดับเดิม ไม่ซ้ำไม่หาย (หลายขนาด)", () => {
    for (const n of [1, 6, 7, 10, 16, 17, 25, 40, 100]) {
      const pages = paginateRows(rows(n), cap);
      expect(pages.flat()).toEqual(rows(n));
      // ทุกหน้าที่ไม่ใช่หน้าสุดท้าย ≤ normal, หน้าสุดท้าย ≤ last และไม่ว่าง
      for (let i = 0; i < pages.length - 1; i++) expect(pages[i].length).toBeLessThanOrEqual(cap.normalPageRows);
      expect(pages[pages.length - 1].length).toBeLessThanOrEqual(cap.lastPageRows);
      expect(pages[pages.length - 1].length).toBeGreaterThan(0);
    }
  });

  it("กรณีพอดีเป๊ะกับหน้าปกติ: หน้าสุดท้ายยังมีแถวเสมอ", () => {
    // 10 แถว: เกิน last(6) → ต้องแบ่ง โดยหน้าสุดท้ายไม่ว่าง
    const pages = paginateRows(rows(10), cap);
    expect(pages.length).toBe(2);
    expect(pages[0].length).toBe(9); // เหลือ 1 แถวให้หน้าสุดท้ายตามกติกา
    expect(pages[1].length).toBe(1);
  });

  it("normal = last (ส่วนสงวนเท่ากัน) ยังแบ่งถูกต้อง", () => {
    const eq: PageCapacity = { normalPageRows: 5, lastPageRows: 5 };
    const pages = paginateRows(rows(12), eq);
    expect(pages.flat()).toEqual(rows(12));
    expect(pages.map((p) => p.length)).toEqual([5, 5, 2]);
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
