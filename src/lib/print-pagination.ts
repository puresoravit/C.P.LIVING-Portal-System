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
// (continuous 9×11 = 263.4mm / A4 = 275mm — ดู print-settings.ts) เพื่อให้แผนแบ่งหน้า
// เดียวกันใช้ได้ทั้งคู่ (Profile ถูกเลือกฝั่ง Client ผ่าน localStorage — Server ไม่รู้)
// Owner UAT (2026-08-29) — continuous Margin บน 6→10mm ตามที่ทดสอบกระดาษจริง (ดู
// print-settings.ts) ทำให้พื้นที่ใช้ได้ลดจาก 267.4 เป็น 263.4mm
export const PRINT_USABLE_HEIGHT_MM = 263.4;

// ความสูงประมาณของ Header โหมด Classic (3 Block: โลโก้บริษัท + ชื่อเอกสาร + ข้อมูลลูกค้า)
// — โหมด Custom Layout คำนวณจริงจาก estimateHeaderHeightMm ได้เลย
export const CLASSIC_HEADER_ESTIMATE_MM = 52;

// Headroom กันประมาณการเพี้ยน (เส้นขอบ/ระยะ Block Gap สะสม/Font Rendering ต่างเครื่อง)
const SAFETY_MM = 8;

// Owner UAT (2026-09-02) — Pagination Rule ใหม่จาก Physical Print Audit: แยกความจุเป็น
// 3 ค่า (เดิมมีแค่ 2 ค่า normal/last แล้วเอา last ไปใช้ 2 ความหมายพร้อมกันซึ่งผิดทั้งคู่ —
// Root Cause ที่ทำให้ 11 รายการถูกแบ่งเป็น [10,1] ทั้งที่หน้าเดียวจุได้จริง):
//   normalPageRows   = หน้าไม่สุดท้าย: ตาราง + "รวมหน้านี้" + Signature (ทุกแผ่นต้องมี
//                      Signature พร้อมเส้นเซ็นตาม Requirement ใหม่ 2026-09-02)
//   finalAloneRows   = เอกสารจบหน้าเดียว: ตาราง + Full Footer (Grand Total + คำอ่าน +
//                      Certification + Signature) — "ไม่มี" กล่องรวมหน้านี้ (Render เฉพาะ
//                      pageCount > 1 เท่านั้น) จึงจุได้มากกว่า last เดิมที่เหมาเข่งหักทั้งคู่
//   finalOfMultiRows = หน้าสุดท้ายของเอกสารหลายหน้า: ตาราง + รวมหน้านี้ + Full Footer
export type PageCapacity = { normalPageRows: number; finalAloneRows: number; finalOfMultiRows: number };

/** ความสูงประมาณของแถวตารางรายการ 1 แถว (มม.) จากค่า Template จริง */
export function estimateRowHeightMm(bodyFontSizePx: number, rowPaddingPx: number): number {
  const LINE_HEIGHT = 1.5; // อิง line-height ปกติของ Body Text ไทย (Tailwind text-xs = 1rem/0.75rem ≈ 1.33 แต่เผื่อสระบน-ล่างไทย)
  const BORDER_MM = 0.4;
  return bodyFontSizePx * LINE_HEIGHT * PX_TO_MM + 2 * rowPaddingPx * PX_TO_MM + BORDER_MM;
}

// Owner UAT (2026-09-02) — Signature Block ต้องมีทุก Physical Sheet (หน้าแรก/กลาง/สุดท้าย
// อย่างละ 1 ชุดเสมอ) — ความสูงวัดจริงจาก Browser Harness = 24.9mm (pt-4 + เส้นเซ็น+Label+
// วันที่ + Footer ขอบคุณ 2 บรรทัด) ปัดเป็น 25 — SALES_ORDER (เอกสารภายใน) ไม่เคยมี
// Signature มาก่อนและไม่เพิ่ม (ดู Comment ใน orders/[id]/print/page.tsx) จึงตั้ง 0
export const SIGNATURE_BLOCK_MM = 25;

// พื้นที่สงวน (มม.) ของแต่ละประเภทเอกสาร นอกเหนือจาก Header/ตาราง:
//   pageSummaryMm        = กล่อง "รวมหน้านี้" ประจำหน้า (ทุกหน้าเมื่อมีหลายหน้า)
//   finalFooterMm        = Full Footer หน้าสุดท้าย/หน้าเดียว (Grand Total + คำอ่าน +
//                          Certification/หมายเหตุ + Signature — รวม Signature แล้ว)
//   signatureEverySheetMm = Signature ประจำแผ่นสำหรับหน้าไม่สุดท้าย (Requirement ใหม่)
// ค่าประมาณจาก Layout จริงของแต่ละ Body Component (แถว Summary × ~6มม. + กรอบ/ระยะ)
export type PrintDocKind = "QUOTATION" | "INVOICE" | "TAX_INVOICE" | "BILLING_NOTE" | "REPAIR_NOTE" | "SALES_ORDER";

export const DOC_PAGE_RESERVES_MM: Record<
  PrintDocKind,
  { pageSummaryMm: number; finalFooterMm: number; signatureEverySheetMm: number }
> = {
  INVOICE: { pageSummaryMm: 24, finalFooterMm: 24 + 10 + 24, signatureEverySheetMm: SIGNATURE_BLOCK_MM },
  QUOTATION: { pageSummaryMm: 32, finalFooterMm: 32 + 24, signatureEverySheetMm: SIGNATURE_BLOCK_MM },
  TAX_INVOICE: { pageSummaryMm: 38, finalFooterMm: 38 + 24, signatureEverySheetMm: SIGNATURE_BLOCK_MM },
  BILLING_NOTE: { pageSummaryMm: 8, finalFooterMm: 8 + 10 + 24, signatureEverySheetMm: SIGNATURE_BLOCK_MM },
  REPAIR_NOTE: { pageSummaryMm: 0, finalFooterMm: 10 + 24, signatureEverySheetMm: SIGNATURE_BLOCK_MM },
  SALES_ORDER: { pageSummaryMm: 0, finalFooterMm: 45, signatureEverySheetMm: 0 }, // เอกสารภายใน — ไม่มี Signature
};

// Owner Approve (2026-09-02) — ความจุ Invoice ที่ Owner เคาะจาก Physical Print จริง +
// Browser Harness (จำลองหน้า 263.4mm ด้วย headerLayout/เนื้อหา Production จริง):
//   finalAloneRows = 14 — กฎธุรกิจตรงตัว "1–14 รายการ = Single-page Invoice" (วัดจริง 14
//                    แถว + Full Footer เหลือ Gap 39.9mm — ปลอดภัยมาก เผื่อชื่อสินค้ายาว
//                    Wrap ได้หลายแถวโดยไม่ล้น)
//   normalPageRows = 17 — Target ที่ Owner กำหนด (วัดจริง 17 แถว + รวมหน้านี้ + Signature
//                    เหลือ Gap 39.5mm)
//   finalOfMultiRows = 14 — คำนวณจากพื้นที่เหลือจริงเมื่อต้องมี รวมหน้านี้ + Full Footer
//                    ตำแหน่ง LOCK บนแผ่นเดียวกัน (วัดจริง: 14 แถว Gap 19.6mm / 15 แถว
//                    13.4mm / 16 แถว 7.2mm — เลือก 14 เผื่อ Wrap เท่ากฎหน้าเดียวพอดี)
// ใช้ได้เฉพาะกับ Print Layout ปัจจุบันที่ Owner LOCK แล้วทั้งชุด (Margin/Header/Font/
// Footer) — ถ้า Layout เปลี่ยนเมื่อไรต้องวัดใหม่ — เอกสารประเภทอื่นยังใช้สูตรประมาณเดิม
// (บวก Signature ทุกแผ่นแล้ว) จนกว่า Owner จะเคาะตัวเลขของประเภทนั้นเอง
export const DOC_CAPACITY_APPROVED: Partial<Record<PrintDocKind, PageCapacity>> = {
  INVOICE: { normalPageRows: 17, finalAloneRows: 14, finalOfMultiRows: 14 },
};

/** คำนวณความจุแถว/หน้า จากพื้นที่จริงหลังหักส่วนสงวนทั้งหมด — Pure Function */
export function estimatePageCapacity(opts: {
  bodyFontSizePx: number;
  rowPaddingPx: number;
  contentPaddingMm: number;
  headerHeightMm: number;
  pageSummaryMm: number;
  finalFooterMm: number;
  signatureEverySheetMm: number;
}): PageCapacity {
  const rowH = estimateRowHeightMm(opts.bodyFontSizePx, opts.rowPaddingPx);
  const theadMm = rowH + 1;
  const usable = PRINT_USABLE_HEIGHT_MM - 2 * opts.contentPaddingMm - opts.headerHeightMm - theadMm - SAFETY_MM;
  const normal = Math.max(1, Math.floor((usable - opts.pageSummaryMm - opts.signatureEverySheetMm) / rowH));
  const finalAlone = Math.max(1, Math.floor((usable - opts.finalFooterMm) / rowH));
  const finalOfMulti = Math.max(1, Math.floor((usable - opts.pageSummaryMm - opts.finalFooterMm) / rowH));
  // finalOfMulti ต้องไม่เกิน normal (โดยสูตรเป็นจริงเสมออยู่แล้ว — Min กันเผื่อค่าสงวนแปลกๆ)
  // ส่วน finalAlone อาจ "มากกว่า" normal ได้โดยชอบ (หน้าเดียวไม่มีกล่องรวมหน้านี้) — ไม่ Clamp
  return { normalPageRows: normal, finalAloneRows: finalAlone, finalOfMultiRows: Math.min(finalOfMulti, normal) };
}

/** ทางลัดจาก Template Settings ที่ Resolve แล้ว (จุดเดียวที่หน้า Print ทุกประเภทเรียก) */
export function capacityForDocument(
  template: Pick<OverridableTemplateSettings, "bodyFontSize" | "spacingDensity" | "contentPadding" | "headerLayout">,
  kind: PrintDocKind,
  // Owner UAT (2026-08-31) — ใบส่งของขยายฟอนต์ตัวเอกสาร +30% ผ่าน CSS ล้วนๆ ที่ Container
  // (ดู invoices/[id]/print/page.tsx bodyStyle) จุดคำนวณความจุแถวต่อหน้านี้ไม่รู้เรื่องด้วย
  // เลยเพราะอ่านแค่ Enum bodyFontSize ที่ Resolve จาก Template Settings ปกติ (ยังเป็น 12px
  // เดิม) ทำให้ประมาณแถวต่อหน้าเกินจริงสำหรับเอกสารยาวหลายหน้า — Parameter นี้ให้เอกสารที่
  // มี Boost แบบนี้ส่งตัวคูณเข้ามาคำนวณร่วมด้วยได้ (ไม่ส่ง = 1 = พฤติกรรมเดิมทุกประการ)
  fontScaleMultiplier = 1
): PageCapacity {
  // Owner Approve (2026-09-02) — ประเภทที่ Owner เคาะตัวเลขจาก Physical Print แล้ว ใช้ค่า
  // นั้นตรงๆ (Layout ทั้งชุด LOCK อยู่ — ดู DOC_CAPACITY_APPROVED) — fontScaleMultiplier
  // ≠ 1 คือมีการ Boost ฟอนต์นอกระบบซึ่งค่าที่วัดไว้ใช้ไม่ได้ ให้ Fallback ไปสูตรประมาณ
  const approved = DOC_CAPACITY_APPROVED[kind];
  if (approved && fontScaleMultiplier === 1) return approved;

  const headerHeightMm = template.headerLayout
    ? estimateHeaderHeightMm(template.headerLayout)
    : CLASSIC_HEADER_ESTIMATE_MM;
  const reserve = DOC_PAGE_RESERVES_MM[kind];
  return estimatePageCapacity({
    bodyFontSizePx: BODY_FONT_SIZE_PX[template.bodyFontSize] * fontScaleMultiplier,
    rowPaddingPx: ROW_PADDING_PX[template.spacingDensity],
    contentPaddingMm: CONTENT_PADDING_MM[template.contentPadding],
    headerHeightMm,
    pageSummaryMm: reserve.pageSummaryMm,
    finalFooterMm: reserve.finalFooterMm,
    signatureEverySheetMm: reserve.signatureEverySheetMm,
  });
}

/** แบ่งแถวเป็นหน้าๆ — Owner Rule (2026-09-02):
 *   - รายการ ≤ finalAloneRows = หน้าเดียว (Full Footer ครบชุด ไม่มีกล่องรวมหน้านี้)
 *   - เกินนั้น: หน้าไม่สุดท้ายจุสูงสุด normalPageRows (มี รวมหน้านี้ + Signature) และ
 *     หน้าสุดท้ายจุสูงสุด finalOfMultiRows (มี รวมหน้านี้ + Full Footer)
 *   - ห้ามขยับตำแหน่ง Footer เพื่อยัดรายการเพิ่มเด็ดขาด (Footer LOCK — ความจุคือความจุ)
 * Invariant ที่ Test ยืนยัน:
 *   1. เรียงลำดับเดิม ครบทุกแถว ไม่ซ้ำไม่หาย
 *   2. หน้าที่ไม่ใช่หน้าสุดท้าย ≤ normalPageRows / หน้าสุดท้าย ≤ finalOfMultiRows (เมื่อ
 *      หลายหน้า) หรือ ≤ finalAloneRows (เมื่อหน้าเดียว)
 *   3. รายการ ≤ finalAloneRows = หน้าเดียวเสมอ
 *   4. ไม่มีหน้าว่าง (ยกเว้นเอกสารไม่มีรายการเลย = หน้าเดียวว่าง ตามหน้าจอเดิม) */
export function paginateRows<T>(rows: T[], cap: PageCapacity): T[][] {
  const normal = Math.max(1, Math.floor(cap.normalPageRows));
  const finalAlone = Math.max(1, Math.floor(cap.finalAloneRows));
  const finalOfMulti = Math.max(1, Math.min(Math.floor(cap.finalOfMultiRows), normal));
  if (rows.length <= finalAlone) return [rows];

  const pages: T[][] = [];
  let start = 0;
  while (rows.length - start > finalOfMulti) {
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
