import { Decimal } from "@prisma/client/runtime/library";
import { extractVat } from "@/lib/pricing";
import {
  BODY_FONT_SIZE_PX,
  ROW_PADDING_PX,
  CONTENT_PADDING_MM,
  estimateHeaderHeightMm,
  type OverridableTemplateSettings,
} from "@/lib/print-template-settings";

// ==========================================================================
// R8 (2026-08-26) — Document Pagination: แบ่งรายการเอกสารเป็นหน้าๆ ฝั่ง Server ให้ทุกหน้า
// เป็น "ฟอร์มสมบูรณ์" (Header เต็ม + ตาราง + Summary ของหน้านั้น) และหน้าสุดท้ายมี Grand
// Total ทั้งเอกสารเพิ่ม — ตาม Requirement ตรงๆ ของ Owner
//
// ทำไมคำนวณจำนวนแถว/หน้าฝั่ง Server (ไม่วัด DOM จริง): Print Pipeline ของระบบนี้เป็น CSS
// ล้วนมาตลอด (ดูเหตุผลใหญ่ใน print-template-settings.ts — เคยพิจารณา JS-measured Height
// แล้วตัดทิ้งเพราะเพิ่มความเสี่ยงต่อ Print โดยไม่จำเป็น) — จึงใช้การประมาณจากค่า Template
// Settings จริง (Font/Padding เป็นตัวเลข px คงที่ + ความสูง Header ประมาณได้จาก
// estimateHeaderHeightMm เดิม) แล้วเผื่อ Headroom — ถ้าประมาณพลาดจริง Browser ยังมี
// Fallback เดิมครบ (tr break-inside:avoid + thead ซ้ำหน้า + print-keep-together) เอกสาร
// ไม่มีทางพัง แค่ตำแหน่งตัดหน้าอาจไม่เป๊ะตามแผน — เป็น Graceful Degradation โดยออกแบบ
//
// จำนวนเงินต่อหน้า: คำนวณจาก "Snapshot ต่อรายการ" ของเอกสารเท่านั้น (netAmount/
// discountAmount ที่ Freeze ไว้แล้ว) ด้วย Decimal — ไม่มีการคำนวณราคา/ส่วนลดใหม่ใดๆ
// (Document Snapshot Principle เดิม) — VAT ต่อหน้าใช้ extractVat/สูตร Rounding เดิมของ
// ระบบ 100% — Grand Total หน้าสุดท้ายใช้ค่าที่ Persist ไว้ในเอกสารตรงๆ ไม่ Recompute
// ==========================================================================

export const PX_TO_MM = 25.4 / 96;

// พื้นที่พิมพ์แนวตั้งที่ใช้วางแผนแบ่งหน้า — ใช้ค่าต่ำสุดของทั้ง 2 Print Profile
// (continuous 9×11 = 267.4mm / A4 = 275mm — ดู print-settings.ts) เพื่อให้แผนแบ่งหน้า
// เดียวกันใช้ได้ทั้งคู่ (Profile ถูกเลือกฝั่ง Client ผ่าน localStorage — Server ไม่รู้)
export const PRINT_USABLE_HEIGHT_MM = 267.4;

// ความสูงประมาณของ Header โหมด Classic (3 Block: โลโก้บริษัท + ชื่อเอกสาร + ข้อมูลลูกค้า)
// — โหมด Custom Layout คำนวณจริงจาก estimateHeaderHeightMm ได้เลย
export const CLASSIC_HEADER_ESTIMATE_MM = 52;

// Headroom กันประมาณการเพี้ยน (เส้นขอบ/ระยะ Block Gap สะสม/Font Rendering ต่างเครื่อง)
const SAFETY_MM = 8;

export type PageCapacity = { normalPageRows: number; lastPageRows: number };

/** ความสูงประมาณของแถวตารางรายการ 1 แถว (มม.) จากค่า Template จริง */
export function estimateRowHeightMm(bodyFontSizePx: number, rowPaddingPx: number): number {
  const LINE_HEIGHT = 1.5; // อิง line-height ปกติของ Body Text ไทย (Tailwind text-xs = 1rem/0.75rem ≈ 1.33 แต่เผื่อสระบน-ล่างไทย)
  const BORDER_MM = 0.4;
  return bodyFontSizePx * LINE_HEIGHT * PX_TO_MM + 2 * rowPaddingPx * PX_TO_MM + BORDER_MM;
}

// พื้นที่สงวน (มม.) ของแต่ละประเภทเอกสาร นอกเหนือจาก Header/ตาราง:
//   pageSummaryMm  = Summary Block ประจำหน้า (ทุกหน้าเมื่อมีหลายหน้า)
//   lastPageExtraMm = ของที่มีเฉพาะหน้าสุดท้าย (Grand Total Block + คำอ่าน + Signature +
//                     Disclaimer/หมายเหตุตามแบบฟอร์มนั้น)
// ค่าประมาณจาก Layout จริงของแต่ละ Body Component (แถว Summary × ~6มม. + กรอบ/ระยะ)
export type PrintDocKind = "QUOTATION" | "INVOICE" | "TAX_INVOICE" | "BILLING_NOTE" | "REPAIR_NOTE" | "SALES_ORDER";

export const DOC_PAGE_RESERVES_MM: Record<PrintDocKind, { pageSummaryMm: number; lastPageExtraMm: number }> = {
  INVOICE: { pageSummaryMm: 24, lastPageExtraMm: 24 + 10 + 24 }, // Doc Summary + Disclaimer + Signature
  QUOTATION: { pageSummaryMm: 32, lastPageExtraMm: 32 + 24 },
  TAX_INVOICE: { pageSummaryMm: 38, lastPageExtraMm: 38 + 24 },
  BILLING_NOTE: { pageSummaryMm: 8, lastPageExtraMm: 8 + 10 + 24 }, // tfoot รวม + คำอ่าน + Signature
  REPAIR_NOTE: { pageSummaryMm: 0, lastPageExtraMm: 10 + 24 }, // หมายเหตุ + Signature (ไม่มีเงิน)
  SALES_ORDER: { pageSummaryMm: 0, lastPageExtraMm: 45 }, // กลุ่มส่วนลด Preview (แปรผัน — เผื่อ ~4 กลุ่ม) + หมายเหตุ
};

/** คำนวณความจุแถว/หน้า จากพื้นที่จริงหลังหักส่วนสงวนทั้งหมด — Pure Function */
export function estimatePageCapacity(opts: {
  bodyFontSizePx: number;
  rowPaddingPx: number;
  contentPaddingMm: number;
  headerHeightMm: number;
  pageSummaryMm: number;
  lastPageExtraMm: number;
}): PageCapacity {
  const rowH = estimateRowHeightMm(opts.bodyFontSizePx, opts.rowPaddingPx);
  const theadMm = rowH + 1;
  const usable = PRINT_USABLE_HEIGHT_MM - 2 * opts.contentPaddingMm - opts.headerHeightMm - theadMm - SAFETY_MM;
  const normal = Math.max(1, Math.floor((usable - opts.pageSummaryMm) / rowH));
  const last = Math.max(1, Math.floor((usable - opts.pageSummaryMm - opts.lastPageExtraMm) / rowH));
  // last ≤ normal เสมอโดยสูตร (หักเพิ่ม) — Math.min กันไว้อีกชั้นเผื่อค่าสงวนติดลบในอนาคต
  return { normalPageRows: normal, lastPageRows: Math.min(last, normal) };
}

/** ทางลัดจาก Template Settings ที่ Resolve แล้ว (จุดเดียวที่หน้า Print ทุกประเภทเรียก) */
export function capacityForDocument(
  template: Pick<OverridableTemplateSettings, "bodyFontSize" | "spacingDensity" | "contentPadding" | "headerLayout">,
  kind: PrintDocKind
): PageCapacity {
  const headerHeightMm = template.headerLayout
    ? estimateHeaderHeightMm(template.headerLayout)
    : CLASSIC_HEADER_ESTIMATE_MM;
  const reserve = DOC_PAGE_RESERVES_MM[kind];
  return estimatePageCapacity({
    bodyFontSizePx: BODY_FONT_SIZE_PX[template.bodyFontSize],
    rowPaddingPx: ROW_PADDING_PX[template.spacingDensity],
    contentPaddingMm: CONTENT_PADDING_MM[template.contentPadding],
    headerHeightMm,
    pageSummaryMm: reserve.pageSummaryMm,
    lastPageExtraMm: reserve.lastPageExtraMm,
  });
}

/** แบ่งแถวเป็นหน้าๆ — หน้าปกติจุ normalPageRows / หน้าสุดท้ายจุ lastPageRows (น้อยกว่า
 * เพราะต้องเผื่อ Grand Total + Signature) — Invariant ที่ Test ยืนยัน:
 *   1. เรียงลำดับเดิม ครบทุกแถว ไม่ซ้ำไม่หาย
 *   2. หน้าที่ไม่ใช่หน้าสุดท้าย ≤ normalPageRows / หน้าสุดท้าย ≤ lastPageRows
 *   3. รายการน้อย (≤ lastPageRows) = หน้าเดียว (Output เดิมของระบบเป๊ะ — Zero Regression)
 *   4. ไม่มีหน้าว่าง (ยกเว้นเอกสารไม่มีรายการเลย = หน้าเดียวว่าง ตามหน้าจอเดิม) */
export function paginateRows<T>(rows: T[], cap: PageCapacity): T[][] {
  const normal = Math.max(1, Math.floor(cap.normalPageRows));
  const last = Math.max(1, Math.min(Math.floor(cap.lastPageRows), normal));
  if (rows.length <= last) return [rows];

  const pages: T[][] = [];
  let start = 0;
  while (rows.length - start > last) {
    // เหลือแถวไว้ให้หน้าสุดท้ายอย่างน้อย 1 แถวเสมอ (ไม่มีหน้าสุดท้ายว่างเปล่า)
    const take = Math.min(normal, rows.length - start - 1);
    pages.push(rows.slice(start, start + take));
    start += take;
  }
  pages.push(rows.slice(start));
  return pages;
}

// ---------------------------------------------------------------------------
// Per-page Summary — คำนวณจาก Snapshot ต่อรายการของหน้านั้นเท่านั้น (Decimal ล้วน)
// ---------------------------------------------------------------------------

const D = (v: unknown) => new Decimal((v as Decimal | number | string | null | undefined) ?? 0);

export type MoneyPageSummary = { gross: number; discount: number; net: number };

/** Invoice/Quotation Item: gross ต่อหน้า = Σ(net + discount) — เอกลักษณ์ต่อแถวจาก
 * สูตรเดิม net = round(qty×price) − discount จึงได้ gross = Σ round(qty×price) ตรงกับ
 * สูตรระดับเอกสารเป๊ะ และผลรวมทุกหน้า = ยอดเอกสารเสมอ (ไม่ Re-derive จากราคา กัน Edge
 * Case ราคา Override) */
export function computeItemsPageSummary(items: { netAmount: unknown; discountAmount: unknown }[]): MoneyPageSummary {
  const discount = items.reduce((s, i) => s.add(D(i.discountAmount)), new Decimal(0));
  const net = items.reduce((s, i) => s.add(D(i.netAmount)), new Decimal(0));
  return { gross: net.add(discount).toNumber(), discount: discount.toNumber(), net: net.toNumber() };
}

export type VatPageSummary = MoneyPageSummary & { netBeforeVat: number; vatAmount: number };

/** Quotation: Summary VAT ต่อหน้า ตามโหมดของเอกสาร (ลำดับ "หักส่วนลดก่อน ค่อยคิด VAT"
 * ตรงกับ aggregateQuotationTotals ระดับเอกสารทุกประการ):
 *   STANDARD — ถอด VAT จากยอดหน้า (บรรทัดเป็น VAT-inclusive) → net คือยอดรวมของหน้า
 *   ADD_ON — บรรทัดเป็นราคาก่อน VAT: ฐาน = ยอดหน้า, VAT = ฐาน×อัตรา÷100, net = ฐาน+VAT */
export function computeQuotationPageSummary(
  items: { netAmount: unknown; discountAmount: unknown }[],
  vatRatePct: unknown,
  vatMode: "NONE" | "STANDARD" | "ADD_ON" = "STANDARD"
): VatPageSummary {
  const base = computeItemsPageSummary(items);
  if (vatMode === "ADD_ON") {
    const vatAmount = new Decimal(base.net).mul(D(vatRatePct)).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      gross: base.gross,
      discount: base.discount,
      netBeforeVat: base.net,
      vatAmount: vatAmount.toNumber(),
      net: new Decimal(base.net).add(vatAmount).toNumber(),
    };
  }
  const { netBeforeVat, vatAmount } = extractVat(new Decimal(base.net), D(vatRatePct));
  return { ...base, netBeforeVat: netBeforeVat.toNumber(), vatAmount: vatAmount.toNumber() };
}

export type TaxInvoicePageSummary = {
  subtotal: number;
  discount: number;
  net: number;
  valueAmount: number;
  vatAmount: number;
};

/** Tax Invoice Item: amount (ก่อนหักส่วนลดบรรทัด) + discountAmount — ยอดหลังส่วนลดของ
 * หน้าแล้วคิด VAT ตามโหมดของเอกสาร (ตรง computeManualTaxInvoiceTotals):
 *   EXTRACT — ราคารวม VAT: ถอดออก (net = ยอดหน้า)
 *   ADD_ON — ราคาก่อน VAT: ฐาน = ยอดหน้า, VAT = ฐาน×อัตรา÷100, net = ฐาน+VAT */
export function computeTaxInvoicePageSummary(
  items: { amount: unknown; discountAmount?: unknown }[],
  vatPct: unknown,
  vatCalcMode: "EXTRACT" | "ADD_ON" = "EXTRACT"
): TaxInvoicePageSummary {
  const subtotal = items.reduce((s, i) => s.add(D(i.amount)), new Decimal(0));
  const discount = items.reduce((s, i) => s.add(D(i.discountAmount)), new Decimal(0));
  const afterDiscount = subtotal.sub(discount);
  if (vatCalcMode === "ADD_ON") {
    const vatAmount = afterDiscount.mul(D(vatPct)).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      subtotal: subtotal.toNumber(),
      discount: discount.toNumber(),
      valueAmount: afterDiscount.toNumber(),
      vatAmount: vatAmount.toNumber(),
      net: afterDiscount.add(vatAmount).toNumber(),
    };
  }
  const { netBeforeVat, vatAmount } = extractVat(afterDiscount, D(vatPct));
  return {
    subtotal: subtotal.toNumber(),
    discount: discount.toNumber(),
    net: afterDiscount.toNumber(),
    valueAmount: netBeforeVat.toNumber(),
    vatAmount: vatAmount.toNumber(),
  };
}

/** Billing Note Row (ระดับใบ Invoice): gross = Σ grandTotal, discount = Σ ส่วนลดต่อใบ
 * (ใบที่หักแล้วตอนออกใบ/ไม่มีส่วนลด = 0 ตาม Data เดิม) — ตรงกับสูตร tfoot เดิม */
export function computeBillingNotePageSummary(
  rows: { grandTotal: unknown; discountAmount?: number }[]
): MoneyPageSummary {
  const gross = rows.reduce((s, r) => s.add(D(r.grandTotal)), new Decimal(0));
  const discount = rows.reduce((s, r) => s.add(D(r.discountAmount)), new Decimal(0));
  return { gross: gross.toNumber(), discount: discount.toNumber(), net: gross.sub(discount).toNumber() };
}
