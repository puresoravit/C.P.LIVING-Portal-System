import { db } from "@/lib/db";
import { z } from "zod";

// ==========================================================================
// R5 — Document Template Settings V1
// Reuse AppSetting เดิม (key/value ธรรมดา) ไม่มี Table ใหม่ — เก็บ 6 Key:
//   template.logo               Base64 Data URI, Global-only
//   template.global             JSON ของ GlobalTemplateSettings ทั้งชุด
//   template.override.<DOC>     JSON ของ Partial<OverridableTemplateSettings>
// ทุกค่าเป็น Enum ปิด (Controlled Settings ไม่ใช่ Free-form) — Default ทุกตัวต้องตรงกับ
// พฤติกรรม Hardcode เดิมของ Shared Print Components เป๊ะ เพื่อ Zero-Regression เมื่อ
// ยังไม่เคยตั้งค่าอะไรเลย (ตรวจสอบเทียบ globals.css/print-document-header.tsx เดิมแล้ว)
// ==========================================================================

export type DocumentTypeKey = "QUOTATION" | "INVOICE" | "TAX_INVOICE" | "BILLING_NOTE" | "REPAIR_NOTE";

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeKey, string> = {
  QUOTATION: "ใบเสนอราคา",
  INVOICE: "ใบส่งของชั่วคราว",
  TAX_INVOICE: "ใบกำกับภาษี",
  BILLING_NOTE: "ใบวางบิล",
  REPAIR_NOTE: "ใบส่งคืนสินค้าฝากซ่อม",
};

export const FONT_FAMILY_OPTIONS = ["sarabun", "th_sarabun_new", "tahoma", "angsana"] as const;
export type FontFamilyKey = (typeof FONT_FAMILY_OPTIONS)[number];

export const FONT_FAMILY_LABELS: Record<FontFamilyKey, string> = {
  sarabun: "Sarabun (ค่าเริ่มต้นระบบ)",
  th_sarabun_new: "TH Sarabun New",
  tahoma: "Tahoma",
  angsana: "Angsana New",
};

// ค่า CSS font-family จริง — พึ่ง Font ที่มีอยู่ในเครื่อง Client เหมือนพฤติกรรมเดิม
// ทุกประการ ไม่ได้ฝัง Font File ใหม่ (CSP font-src 'self' + ไม่มี Font Asset ใดๆ อยู่แล้ว
// ในระบบตอนนี้ — คงสถาปัตยกรรมเดิมไว้ตามที่ยืนยัน ยังไม่ Bundle/Embed Font ในรอบ R5 นี้)
export const FONT_FAMILY_CSS: Record<FontFamilyKey, string> = {
  sarabun: `"Sarabun", "Segoe UI", "Tahoma", ui-sans-serif, system-ui, sans-serif`,
  th_sarabun_new: `"TH Sarabun New", "Sarabun", "Tahoma", ui-sans-serif, sans-serif`,
  tahoma: `"Tahoma", "Segoe UI", ui-sans-serif, sans-serif`,
  angsana: `"Angsana New", "AngsanaUPC", "Tahoma", serif`,
};

export const FONT_SIZE_OPTIONS = ["compact", "normal", "large"] as const;
export type FontSizeKey = (typeof FONT_SIZE_OPTIONS)[number];

export const FONT_SIZE_LABELS: Record<FontSizeKey, string> = {
  compact: "กระชับ",
  normal: "ปกติ (ค่าเริ่มต้น)",
  large: "ใหญ่ขึ้น",
};

// px อ้างอิงจากขนาดจริงที่ Hardcode อยู่ในปัจจุบัน — Body = text-xs (12px) ของ Item
// Table/Customer Info/Amount Summary, Heading = text-sm (14px) ของชื่อบริษัท/ชื่อเอกสาร
// "normal" ต้องเท่าปัจจุบันเป๊ะเสมอ (Zero-Regression) — Signature Label (10px)/Footer
// เล็ก (9px) ไม่ผูกกับ Control นี้ ตรึงค่าเดิมไว้ (จุดเสี่ยง Pagination สูงสุด)
export const BODY_FONT_SIZE_PX: Record<FontSizeKey, number> = { compact: 11, normal: 12, large: 13 };
export const HEADING_FONT_SIZE_PX: Record<FontSizeKey, number> = { compact: 13, normal: 14, large: 16 };

export const SPACING_DENSITY_OPTIONS = ["compact", "normal", "relaxed"] as const;
export type SpacingDensityKey = (typeof SPACING_DENSITY_OPTIONS)[number];

export const SPACING_DENSITY_LABELS: Record<SpacingDensityKey, string> = {
  compact: "กระชับ",
  normal: "ปกติ (ค่าเริ่มต้น)",
  relaxed: "โปร่งขึ้น",
};

// px อ้างอิงจาก py-1 (4px) ของแถวตาราง และ mb-1.5 (6px) ของระยะห่างระหว่าง Block —
// "normal" ต้องเท่าปัจจุบันเป๊ะเสมอ
export const ROW_PADDING_PX: Record<SpacingDensityKey, number> = { compact: 2, normal: 4, relaxed: 6 };
export const BLOCK_GAP_PX: Record<SpacingDensityKey, number> = { compact: 4, normal: 6, relaxed: 10 };

export const CONTENT_PADDING_OPTIONS = ["none", "small", "medium"] as const;
export type ContentPaddingKey = (typeof CONTENT_PADDING_OPTIONS)[number];

export const CONTENT_PADDING_LABELS: Record<ContentPaddingKey, string> = {
  none: "ไม่มี (ค่าเริ่มต้น — เท่าปัจจุบัน)",
  small: "น้อย (2mm)",
  medium: "ปานกลาง (4mm)",
};

// มม. เสริมด้านในพื้นที่พิมพ์ (คนละเรื่องกับ @page margin ใน print-settings.ts ที่ไม่แตะ
// เลย) — ถูกหักออกจาก --print-content-height ให้อัตโนมัติกัน Signature Block ดันล้นหน้า
// "none" = 0mm ตรงกับพฤติกรรมปัจจุบัน (print:p-0) เป๊ะ
export const CONTENT_PADDING_MM: Record<ContentPaddingKey, number> = { none: 0, small: 2, medium: 4 };

export const LOGO_SIZE_OPTIONS = ["small", "normal", "large"] as const;
export type LogoSizeKey = (typeof LOGO_SIZE_OPTIONS)[number];

export const LOGO_SIZE_LABELS: Record<LogoSizeKey, string> = {
  small: "เล็ก",
  normal: "ปกติ (ค่าเริ่มต้น — เท่าปัจจุบัน)",
  large: "ใหญ่ขึ้น",
};

// px อ้างอิงจาก h-11 (44px) ของ Logo ปัจจุบัน — "normal" ต้องเท่าปัจจุบันเป๊ะ (h-11 w-auto
// ไม่มี max-width มาก่อน) maxWidthPx: null = ไม่จำกัดความกว้าง (คงพฤติกรรม w-auto เดิม)
// small/large เป็น Tier ใหม่ที่ไม่เคยมีมาก่อน จึงกำหนด max-width กันโลโก้แนวนอนกว้างมาก
// ทับข้อความหัวกระดาษที่อยู่ตรงกลาง (มี px-14 = 56px เป็นระยะเว้นจากขอบ)
export const LOGO_SIZE_PX: Record<LogoSizeKey, { heightPx: number; maxWidthPx: number | null }> = {
  small: { heightPx: 32, maxWidthPx: 96 },
  normal: { heightPx: 44, maxWidthPx: null },
  large: { heightPx: 56, maxWidthPx: 160 },
};

// R6 Phase E — Visual Document Designer: Block ที่อยู่ "เหนือ" Item Table (Header/
// Logo, Document Title, Customer Info) ไม่มีเนื้อหาที่ขยายตามข้อมูลจริง (ไม่เหมือน Item
// Table/Amount Summary ที่ยาวได้ตามจำนวนรายการ หรือ Signature ที่ต้อง mt-auto ชิดขอบ
// ล่างเสมอ) จึงเป็นกลุ่มเดียวที่ Drag ลำดับได้อย่างปลอดภัยโดยไม่กระทบ Pagination —
// Item Table+Amount Summary (Fused เป็น Component เดียวต่อประเภทเอกสารอยู่แล้ว ผูกกับ
// flex-1 Spacer) และ Signature+Footer (ผูกกับ mt-auto) ตรึงตำแหน่งเดิมเสมอ ไม่ให้ Drag
// (ตรงกับที่ Owner อนุญาตไว้ตรงๆ ว่า "Block ที่เสี่ยงต่อ Pagination จำกัดการลากได้")
export const PRINT_BLOCK_KEYS = ["header", "title", "customerInfo"] as const;
export type PrintBlockKey = (typeof PRINT_BLOCK_KEYS)[number];
export const PRINT_BLOCK_LABELS: Record<PrintBlockKey, string> = {
  header: "โลโก้ + ข้อมูลบริษัท",
  title: "ชื่อเอกสาร",
  customerInfo: "ข้อมูลลูกค้า + เลขที่เอกสาร",
};
export const DEFAULT_BLOCK_ORDER: PrintBlockKey[] = [...PRINT_BLOCK_KEYS];

/** ตรวจว่า Array ที่ได้มา (จาก AppSetting เดิม/Client) เป็น Permutation ของ
 * PRINT_BLOCK_KEYS ครบถ้วนจริง (ไม่ขาด/ไม่ซ้ำ) — ถ้าไม่ใช่ (Data เก่าก่อนมี Field นี้,
 * แก้ DB มือ, หรือ Bug ในอนาคต) Fallback ไป Default เสมอ กัน Block หายไปจากหน้า Print
 * อย่างเงียบๆ (เช่น customerInfo หายจะทำให้เลขที่เอกสารไม่ขึ้นเลย — ความเสี่ยงทางธุรกิจ
 * จริง ไม่ใช่แค่ความสวยงาม) */
export function resolveBlockOrder(order: unknown): PrintBlockKey[] {
  if (!Array.isArray(order) || order.length !== PRINT_BLOCK_KEYS.length) return DEFAULT_BLOCK_ORDER;
  const asSet = new Set(order);
  const isValidPermutation = asSet.size === PRINT_BLOCK_KEYS.length && PRINT_BLOCK_KEYS.every((k) => asSet.has(k));
  return isValidPermutation ? (order as PrintBlockKey[]) : DEFAULT_BLOCK_ORDER;
}

// ==========================================================================
// R6 Phase E.2 — Controlled Free-position Header Designer
// (แทนที่ Grid 3×2 Cell-swap ของ Phase E.1 ทั้งหมด — Data Shape เปลี่ยน แต่ Key
// AppSetting เดิม/Field เดิม "headerLayout" ไม่เปลี่ยน ไม่มี Migration ใหม่)
//
// สถาปัตยกรรมที่เลือก: "Fine Grid" แทนที่จะเป็น Pixel Coordinate อิสระจริง —
// คอลัมน์ 100 ช่อง (% ของความกว้าง Header — Scale ตาม A4/9×11 อัตโนมัติเพราะเป็น
// สัดส่วนสัมพัทธ์) × แถวละเอียด HEADER_ROW_UNIT_MM มม./แถว (หน่วยจริงคงที่ไม่ผูกกับ
// Viewport) ใช้ grid-auto-rows: minmax(Xmm, auto) — "minmax" คือกุญแจสำคัญ: ให้แถว
// สูงขั้นต่ำ Xmm แต่ "auto" ยอมให้โตขึ้นถ้าเนื้อหา (ข้อความยาวหลายบรรทัด) ต้องการพื้นที่
// มากกว่านั้นจริง จึงไม่มีทาง Overflow ออกนอกกรอบ Grid ของตัวเองได้เลย — เป็นกลไกเดียวกับ
// ที่ Phase E.1 ใช้ (grid-template-rows: auto) เพียงแค่ละเอียดขึ้นมาก (Resolution สูงพอ
// ให้ลาก/Resize รู้สึกอิสระต่อเนื่องด้วยเมาส์จริง) — ผลคือ:
//   1. ไม่มี Absolute Positioning ที่ไหนเลย (เหมือน E/E.1 ทุกประการ)
//   2. Header สูงตามเนื้อหาจริงเสมอ (Content ต่ำสุด + Row สุดท้ายที่ใช้) ไม่ต้องวัดด้วย
//      JavaScript เลย — Item Table ที่ตามมาหลัง Grid ถูก "ดัน" ลงตาม Document Flow ปกติ
//      โดยอัตโนมัติ เหมือน E.1 เป๊ะ (Print Pipeline เดิมของ Item Table/Summary/
//      Signature/Footer ไม่ถูกแตะเลยแม้แต่บรรทัดเดียว)
//   3. พิกัดเป็น Grid-unit (Integer) ไม่ใช่ Pixel จึงเป็น "Normalized/Relative
//      Coordinate" ตรงตาม Requirement — Layout เดียวกันแสดงผลถูกสัดส่วนทั้ง A4/9×11
//      โดยไม่ต้องแปลงหน่วยเองที่ไหนเลย
// พิจารณาทางเลือกอื่น (True Absolute-pixel Positioning + JS-measured Height เพื่อดัน
// Table ลง) แล้วตัดสินใจไม่ใช้ เพราะจะเปลี่ยนกลไก Pagination-safety จาก CSS ล้วนๆ (ที่
// พิสูจน์แล้วว่าเชื่อถือได้ตลอด Phase E/E.1) ไปเป็นการวัด DOM ด้วย JS ก่อน Print ซึ่งเพิ่ม
// ความเสี่ยงต่อ Print Pipeline โดยไม่จำเป็น — แนวทาง Fine Grid นี้ได้ Experience แบบ
// "ลากอิสระ" ตามที่ Owner ต้องการ โดยไม่ต้องแลกกับความเสี่ยงนั้นเลย
//
// headerLayout = null (Default) = โหมด Classic เดิมของ Phase E ทุกประการ (ไม่แตะ) —
// Element ในนี้ครอบคลุมเฉพาะพื้นที่เหนือ Item Table เท่านั้น เหมือน E.1 ทุกประการ
// ==========================================================================

// R6 Phase E.3 — Semantic Element Free Layout: แตกจาก 6 Block (บาง Block รวมหลาย
// บรรทัด/ความหมายไว้ในกล่องเดียว เช่น "title" เคยมีทั้งไทย+อังกฤษ, "customerDetails"
// เคยมีทั้งที่อยู่+ภาษี+สถานที่ส่ง) เป็น 15 Element ระดับความหมายเดียว (1 Element = 1
// บรรทัด/1 ข้อมูล) ตามที่ Owner ระบุตรงๆ ("Thai/English title ต้องเป็นคนละ Element
// เพื่อจัดกึ่งกลางและระยะห่างแยกกันได้") — เพิ่ม customerCode/reference นอกเหนือจาก 13
// รายการที่ Owner ระบุ เพื่อไม่ให้ Field จริงที่เคยแสดงอยู่แล้ว (รหัสลูกค้า, อ้างถึงของ
// Repair Note) หายไปจาก Header โดยไม่มี Element รองรับ — สอดคล้องกับเจตนา "Semantic
// Element" ที่ Owner วางไว้ (1 ข้อมูลจริง 1 Element) มากกว่าการทิ้งข้อมูลไปเฉยๆ
//
// ไม่ใช่ทุก Element จะมีอยู่จริงในทุกประเภทเอกสาร (เช่น Billing Note ไม่มี
// customerAddress/shippingAddress, Repair Note ไม่มี customerTaxId) — Layout Config
// ยังเก็บตำแหน่งของทั้ง 15 Element ไว้เหมือนกันหมดทุกประเภทเอกสาร/Global (Type เดียว
// ใช้ร่วมกัน ไม่ต้องมี Schema แยกตามประเภทเอกสาร) แต่หน้า Print จริงแต่ละประเภทจะส่ง
// Content เป็น undefined สำหรับ Element ที่ไม่มีข้อมูลจริงในเอกสารนั้น — HeaderZone จะไม่
// Render Element ที่ไม่มี Content ให้เลย (Data-driven) ซ้อนกับ visible Flag ที่ผู้ใช้
// กำหนดเอง (User-driven) — ทั้งสองเงื่อนไขต้องผ่านถึงจะแสดง
export const HEADER_ELEMENT_KEYS = [
  "logo",
  "companyName",
  "companyAddress",
  "companyPhone",
  "companyTaxId",
  "titleTh",
  "titleEn",
  "docNumber",
  "docDate",
  "customerCode",
  "customerName",
  "customerAddress",
  "customerTaxId",
  "shippingAddress",
  "reference",
] as const;
export type HeaderElementKey = (typeof HEADER_ELEMENT_KEYS)[number];
export const HEADER_ELEMENT_LABELS: Record<HeaderElementKey, string> = {
  logo: "โลโก้",
  companyName: "ชื่อบริษัท",
  companyAddress: "ที่อยู่บริษัท",
  companyPhone: "เบอร์โทรบริษัท",
  companyTaxId: "เลขผู้เสียภาษีบริษัท",
  titleTh: "ชื่อเอกสาร (ไทย)",
  titleEn: "ชื่อเอกสาร (อังกฤษ)",
  docNumber: "เลขที่เอกสาร",
  docDate: "วันที่เอกสาร",
  customerCode: "รหัสลูกค้า",
  customerName: "ชื่อลูกค้า",
  customerAddress: "ที่อยู่ลูกค้า",
  customerTaxId: "เลขผู้เสียภาษีลูกค้า",
  shippingAddress: "สถานที่ส่งสินค้า",
  reference: "อ้างถึง",
};

export const HEADER_ALIGN_OPTIONS = ["left", "center", "right"] as const;
export type HeaderAlignKey = (typeof HEADER_ALIGN_OPTIONS)[number];
export const HEADER_ALIGN_LABELS: Record<HeaderAlignKey, string> = { left: "ซ้าย", center: "กลาง", right: "ขวา" };

// R6 Phase E.3 Follow-up — Owner ระบุตรงๆ ว่าต้องเลือกตัวหนา/บางได้เองต่อบรรทัด (ไม่ผูกกับ
// "เป็น Title หรือเปล่า" อีกต่อไป) — เดิม Bold ผูกอยู่กับ Prop `bold` แบบ Hardcode เฉพาะ
// companyName/titleTh เท่านั้น (ดู DEFAULT_HEADER_LAYOUT ด้านล่างสำหรับการ Map ค่าเริ่มต้น
// ให้ตรงกับพฤติกรรมเดิมเป๊ะ — Zero-Regression)
export const HEADER_FONT_WEIGHT_OPTIONS = ["normal", "bold"] as const;
export type HeaderFontWeightKey = (typeof HEADER_FONT_WEIGHT_OPTIONS)[number];
export const HEADER_FONT_WEIGHT_LABELS: Record<HeaderFontWeightKey, string> = { normal: "ปกติ", bold: "หนา" };

// ความละเอียดของ Fine Grid — ดู Comment ใหญ่ด้านบนสำหรับเหตุผลสถาปัตยกรรมเต็ม
export const HEADER_GRID_COLUMNS = 100; // % ของความกว้าง Header Zone
export const HEADER_ROW_UNIT_MM = 2; // มม./แถว (หน่วยจริง คงที่ไม่ผูกกับหน้าจอ/Viewport)
export const HEADER_MAX_ROWS = 60; // เพดานเชิงโครงสร้างเท่านั้น (=120มม. กว้างขวางกว่า Header จริงมาก)
// สูงกว่านี้ถือว่าเสี่ยงกิน "พื้นที่พิมพ์" ของ Item Table ไปมาก — แสดง Warning ใน Designer
// (ไม่ Block เพราะยังพิมพ์ได้จริง แค่เตือนให้ Owner ทราบ ตาม Precedent เดิมของ Phase E) —
// R6 Phase E.3 — ปรับขึ้นจาก 60→100มม. เพราะแตกเป็น 15 Element ระดับบรรทัดแล้ว Default ที่
// ไม่ Overlap กันเองจริงต้องใช้พื้นที่มากกว่า Model เดิม (6 Block) ตามธรรมชาติ — ยืนยันว่า
// DEFAULT_HEADER_LAYOUT ด้านล่างสูงรวมไม่เกิน 90มม. (ต่ำกว่าเกณฑ์นี้เสมอ ไม่ Warning เท็จ
// ตอนเพิ่งเปิดโหมด Custom ครั้งแรก)
export const HEADER_HEIGHT_WARNING_MM = 100;

export const LINE_HEIGHT_MIN = 1.0;
export const LINE_HEIGHT_MAX = 2.0;
export const COL_SPAN_MIN = 10; // 10% ความกว้างขั้นต่ำ กัน Element แคบจนอ่านไม่ได้
export const COL_SPAN_MAX = HEADER_GRID_COLUMNS;
export const ROW_SPAN_MIN = 3; // 6มม. ขั้นต่ำ
export const ROW_SPAN_MAX = HEADER_MAX_ROWS;
export const LOGO_ROW_SPAN_MIN = 3; // 6มม.
export const LOGO_ROW_SPAN_MAX = 12; // 24มม. (เทียบเท่าเพดานเดิมของ E.1 ~90px)

/** ขอบเขต Font Size ปลอดภัยของแต่ละ Element แยกกัน (ตามที่ Owner ระบุตรงๆ ว่าแต่ละ
 * Element ต้องมี Min/Max ของตัวเอง) — titleTh กว้างสุดเพราะเป็นหัวเรื่องเด่นของเอกสาร,
 * Element รองลงมา (ที่อยู่/เลขภาษี/สถานที่ส่ง) แคบสุดเพราะเป็นข้อมูลรอง */
export const HEADER_FONT_SIZE_BOUNDS: Record<Exclude<HeaderElementKey, "logo">, { min: number; max: number }> = {
  companyName: { min: 8, max: 20 },
  companyAddress: { min: 6, max: 14 },
  companyPhone: { min: 6, max: 14 },
  companyTaxId: { min: 6, max: 14 },
  titleTh: { min: 10, max: 28 },
  titleEn: { min: 8, max: 22 },
  docNumber: { min: 8, max: 16 },
  docDate: { min: 8, max: 16 },
  customerCode: { min: 7, max: 14 },
  customerName: { min: 8, max: 18 },
  customerAddress: { min: 7, max: 14 },
  customerTaxId: { min: 7, max: 14 },
  shippingAddress: { min: 7, max: 14 },
  reference: { min: 7, max: 14 },
};

export type HeaderElementStyle = {
  colStart: number; // 1-100
  colSpan: number; // 1-100, colStart+colSpan-1 <= 100
  rowStart: number; // 1-HEADER_MAX_ROWS
  rowSpan: number; // 1-HEADER_MAX_ROWS, rowStart+rowSpan-1 <= HEADER_MAX_ROWS
  align: HeaderAlignKey;
  fontSizePx: number;
  lineHeight: number;
  fontWeight: HeaderFontWeightKey;
  visible: boolean;
  // R6 Phase E.3 — "Font family ถ้าเหมาะสม" (Owner ระบุเป็น Optional เอง) — undefined =
  // สืบทอด Font Family ระดับ Global ตามปกติ (--print-font-family) เหมือน Zero-Regression
  // เดิมทุกประการ ตั้งค่าเฉพาะเมื่อ Owner ต้องการ Override เป็นรายElement จริงๆ เท่านั้น
  fontFamily?: FontFamilyKey;
};
export type HeaderLogoStyle = Omit<HeaderElementStyle, "fontSizePx" | "lineHeight" | "fontFamily" | "fontWeight">;

export type HeaderLayoutConfig = Record<Exclude<HeaderElementKey, "logo">, HeaderElementStyle> & { logo: HeaderLogoStyle };

// ตำแหน่งเริ่มต้นเมื่อ Owner เปิดโหมด Custom ครั้งแรก (หรือกด Reset) — จัดเป็น 4 กลุ่มตาม
// แถว (ไม่ Overlap กันเองโดยโครงสร้าง เพราะแต่ละกลุ่มอยู่คนละช่วงแถว): แบรนด์ (โลโก้+ชื่อ/
// ที่อยู่/เบอร์/ภาษีบริษัท) → ชื่อเอกสาร (ไทย/อังกฤษ แยกบรรทัด กึ่งกลางทั้งคู่) → ข้อมูล
// เอกสาร (เลขที่/วันที่/รหัสลูกค้า) → ข้อมูลลูกค้า (ชื่อ/ที่อยู่/ภาษี/สถานที่ส่ง/อ้างถึง)
export const DEFAULT_HEADER_LAYOUT: HeaderLayoutConfig = {
  logo: { colStart: 1, colSpan: 20, rowStart: 1, rowSpan: 9, align: "left", visible: true },
  companyName: { colStart: 24, colSpan: 77, rowStart: 1, rowSpan: 4, align: "center", fontSizePx: 12, lineHeight: 1.2, fontWeight: "bold", visible: true },
  companyAddress: { colStart: 24, colSpan: 77, rowStart: 5, rowSpan: 4, align: "center", fontSizePx: 9, lineHeight: 1.2, fontWeight: "normal", visible: true },
  companyPhone: { colStart: 24, colSpan: 37, rowStart: 9, rowSpan: 4, align: "center", fontSizePx: 9, lineHeight: 1.2, fontWeight: "normal", visible: true },
  companyTaxId: { colStart: 62, colSpan: 39, rowStart: 9, rowSpan: 4, align: "center", fontSizePx: 9, lineHeight: 1.2, fontWeight: "normal", visible: true },
  titleTh: { colStart: 1, colSpan: 100, rowStart: 14, rowSpan: 4, align: "center", fontSizePx: 14, lineHeight: 1.2, fontWeight: "bold", visible: true },
  titleEn: { colStart: 1, colSpan: 100, rowStart: 18, rowSpan: 4, align: "center", fontSizePx: 12, lineHeight: 1.2, fontWeight: "normal", visible: true },
  docNumber: { colStart: 55, colSpan: 46, rowStart: 22, rowSpan: 4, align: "right", fontSizePx: 12, lineHeight: 1.3, fontWeight: "normal", visible: true },
  docDate: { colStart: 55, colSpan: 46, rowStart: 26, rowSpan: 4, align: "right", fontSizePx: 12, lineHeight: 1.3, fontWeight: "normal", visible: true },
  customerCode: { colStart: 1, colSpan: 54, rowStart: 26, rowSpan: 4, align: "left", fontSizePx: 12, lineHeight: 1.3, fontWeight: "normal", visible: true },
  customerName: { colStart: 1, colSpan: 100, rowStart: 30, rowSpan: 4, align: "left", fontSizePx: 12, lineHeight: 1.3, fontWeight: "normal", visible: true },
  customerAddress: { colStart: 1, colSpan: 100, rowStart: 34, rowSpan: 4, align: "left", fontSizePx: 11, lineHeight: 1.3, fontWeight: "normal", visible: true },
  customerTaxId: { colStart: 1, colSpan: 48, rowStart: 38, rowSpan: 4, align: "left", fontSizePx: 11, lineHeight: 1.3, fontWeight: "normal", visible: true },
  shippingAddress: { colStart: 50, colSpan: 51, rowStart: 38, rowSpan: 4, align: "left", fontSizePx: 11, lineHeight: 1.3, fontWeight: "normal", visible: true },
  reference: { colStart: 1, colSpan: 48, rowStart: 42, rowSpan: 4, align: "left", fontSizePx: 11, lineHeight: 1.3, fontWeight: "normal", visible: true },
};

function clampNum(n: unknown, min: number, max: number, fallback: number): number {
  const num = Number(n);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, Math.round(num))) : fallback;
}

function resolveAlign(raw: unknown, fallback: HeaderAlignKey): HeaderAlignKey {
  return (HEADER_ALIGN_OPTIONS as readonly string[]).includes(raw as string) ? (raw as HeaderAlignKey) : fallback;
}

/** Clamp colStart/colSpan (และ rowStart/rowSpan ด้วย Bound ที่ส่งมา) ให้อยู่ในขอบเขต
 * ปลอดภัยเสมอ — colStart+colSpan-1 ต้องไม่เกิน HEADER_GRID_COLUMNS/HEADER_MAX_ROWS
 * (Clamp colStart ลงถ้าจำเป็นแทนที่จะปฏิเสธทั้งก้อน กัน Element หลุดจอไปเงียบๆ) */
function resolveBox(
  r: Record<string, any>,
  fallback: Pick<HeaderElementStyle, "colStart" | "colSpan" | "rowStart" | "rowSpan">,
  rowSpanBounds: { min: number; max: number }
): Pick<HeaderElementStyle, "colStart" | "colSpan" | "rowStart" | "rowSpan"> {
  const colSpan = clampNum(r.colSpan, COL_SPAN_MIN, COL_SPAN_MAX, fallback.colSpan);
  const colStart = clampNum(r.colStart, 1, HEADER_GRID_COLUMNS - colSpan + 1, Math.min(fallback.colStart, HEADER_GRID_COLUMNS - colSpan + 1));
  const rowSpan = clampNum(r.rowSpan, rowSpanBounds.min, rowSpanBounds.max, fallback.rowSpan);
  const rowStart = clampNum(r.rowStart, 1, HEADER_MAX_ROWS - rowSpan + 1, Math.min(fallback.rowStart, HEADER_MAX_ROWS - rowSpan + 1));
  return { colStart, colSpan, rowStart, rowSpan };
}

/** ตรวจ + Clamp HeaderLayoutConfig ที่ได้จาก AppSetting/Client เสมอก่อนใช้งานจริง —
 * null/undefined = โหมด Classic (ไม่ใช่ข้อมูลเสีย) คืน null ตรงๆ — ข้อมูลรูปแบบเก่า
 * (E.1 Grid-cell Shape ที่ไม่มี colStart) หรือข้อมูลเสีย/แก้ DB มือ จะไม่ผ่าน Validation
 * ของ resolveBox/resolveTextElement (อ่าน field ที่ไม่มีอยู่ได้ NaN → Fallback ไปค่า
 * Default ของแต่ละ Field เอง) จึงเป็น Safe Fallback ให้ทั้งข้อมูลเก่าและข้อมูลเสียโดย
 * อัตโนมัติ ไม่ต้อง Detect Shape เป็นพิเศษ — ทุก Field ตัวเลข Clamp ภายใน Safe Bounds
 * ของตัวเองเสมอ กัน Font Size/ตำแหน่ง/ขนาดที่ผิดพลาดทำให้ Header ล้นพื้นที่พิมพ์ */
const TEXT_ELEMENT_KEYS = HEADER_ELEMENT_KEYS.filter((k): k is Exclude<HeaderElementKey, "logo"> => k !== "logo");

export function resolveHeaderLayout(raw: unknown): HeaderLayoutConfig | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return DEFAULT_HEADER_LAYOUT;
  const obj = raw as Record<string, any>;

  function resolveTextElement(key: Exclude<HeaderElementKey, "logo">): HeaderElementStyle {
    const bounds = HEADER_FONT_SIZE_BOUNDS[key];
    const fallback = DEFAULT_HEADER_LAYOUT[key];
    const r = obj[key] && typeof obj[key] === "object" ? obj[key] : {};
    const fontFamily = (FONT_FAMILY_OPTIONS as readonly string[]).includes(r.fontFamily) ? (r.fontFamily as FontFamilyKey) : undefined;
    const fontWeight = (HEADER_FONT_WEIGHT_OPTIONS as readonly string[]).includes(r.fontWeight)
      ? (r.fontWeight as HeaderFontWeightKey)
      : fallback.fontWeight;
    return {
      ...resolveBox(r, fallback, { min: ROW_SPAN_MIN, max: ROW_SPAN_MAX }),
      align: resolveAlign(r.align, fallback.align),
      fontSizePx: clampNum(r.fontSizePx, bounds.min, bounds.max, fallback.fontSizePx),
      lineHeight: clampNum(r.lineHeight * 10, LINE_HEIGHT_MIN * 10, LINE_HEIGHT_MAX * 10, fallback.lineHeight * 10) / 10,
      fontWeight,
      visible: typeof r.visible === "boolean" ? r.visible : true,
      ...(fontFamily ? { fontFamily } : {}),
    };
  }

  const logoRaw = obj.logo && typeof obj.logo === "object" ? obj.logo : {};
  const result: Partial<HeaderLayoutConfig> = {
    logo: {
      ...resolveBox(logoRaw, DEFAULT_HEADER_LAYOUT.logo, { min: LOGO_ROW_SPAN_MIN, max: LOGO_ROW_SPAN_MAX }),
      align: resolveAlign(logoRaw.align, DEFAULT_HEADER_LAYOUT.logo.align),
      visible: typeof logoRaw.visible === "boolean" ? logoRaw.visible : true,
    },
  };
  for (const key of TEXT_ELEMENT_KEYS) {
    result[key] = resolveTextElement(key);
  }
  return result as HeaderLayoutConfig;
}

/** แปลง rowSpan ของ Logo เป็นความสูงจริง (มม.) — จุดเดียวที่ทุก Caller (หน้า Print จริง
 * ทั้ง 5 + Designer Canvas) ต้องเรียก กัน Physical Unit เพี้ยนกันระหว่างจุด */
export function logoHeightMm(logoStyle: Pick<HeaderLogoStyle, "rowSpan">): number {
  return logoStyle.rowSpan * HEADER_ROW_UNIT_MM;
}

/** รวมความสูงประมาณของ Header (มม.) จาก Layout — ใช้แสดง Warning ใน Designer เท่านั้น
 * (ไม่ใช่ค่าที่ใช้ Render จริง — Render จริงมาจาก CSS auto-height เสมอ) Pure Function
 * Unit Test ได้ตรงๆ */
export function estimateHeaderHeightMm(layout: HeaderLayoutConfig): number {
  const maxBottomRow = Math.max(
    ...HEADER_ELEMENT_KEYS.filter((k) => layout[k].visible).map((k) => layout[k].rowStart + layout[k].rowSpan - 1)
  );
  return Number.isFinite(maxBottomRow) ? maxBottomRow * HEADER_ROW_UNIT_MM : 0;
}

const FOOTER_NOTE_MAX_LENGTH = 200;
// ข้อความเดิมที่ Hardcode อยู่ใน print-signature-block.tsx ตอนนี้ — ใช้เป็น Default
// \n คงรูปแบบ 2 บรรทัดเดิมไว้เป๊ะ (Render ด้วย white-space: pre-line) เพื่อ
// Zero-Regression ทางสายตา ไม่ใช่แค่ข้อความเนื้อหาเดียวกัน
export const DEFAULT_FOOTER_NOTE = "ขอขอบคุณลูกค้าที่ไว้วางใจเรา\nThank you for your trust and support.";

// ---------------------------------------------------------------------------
// Overridable fields — ใช้ร่วมกันทั้ง Global และ Per-Document Override
// logoSize ไม่รวมในนี้โดยเจตนา (Global-only ตามที่อนุมัติ ไม่ให้ Override รายเอกสาร
// เพื่อ Semantic ชัดเจน — ผูกแค่กับ template.logo ที่เป็น Global-only เหมือนกัน)
// ---------------------------------------------------------------------------
export type OverridableTemplateSettings = {
  showAddress: boolean;
  showPhone: boolean;
  showTaxId: boolean;
  footerNote: string;
  fontFamily: FontFamilyKey;
  bodyFontSize: FontSizeKey;
  headingFontSize: FontSizeKey;
  spacingDensity: SpacingDensityKey;
  contentPadding: ContentPaddingKey;
  // R6 Phase E — ลำดับ Block เหนือ Item Table (ดู resolveBlockOrder ด้านบน) —
  // Per-Document Override ได้เหมือน Field อื่นทุกตัวในนี้ (Consistent กับสถาปัตยกรรม
  // Global→Override เดิมทั้งหมด ไม่ต้องมี Mechanism ใหม่)
  blockOrder: PrintBlockKey[];
  // R6 Phase E.1 — null = โหมด Classic (ใช้ blockOrder 3-Block เดิมด้านบน) — ไม่ null =
  // โหมด Header Layout แบบละเอียด (ดู resolveHeaderLayout ด้านบน) — Per-Document
  // Override ได้เหมือนกัน (Consistent กับ Field อื่นทุกตัว)
  headerLayout: HeaderLayoutConfig | null;
};

export type GlobalTemplateSettings = OverridableTemplateSettings & { logoSize: LogoSizeKey };

export type DocumentTemplateOverride = Partial<OverridableTemplateSettings>;

export const DEFAULT_GLOBAL_TEMPLATE_SETTINGS: GlobalTemplateSettings = {
  showAddress: true,
  showPhone: true,
  showTaxId: true,
  footerNote: DEFAULT_FOOTER_NOTE,
  fontFamily: "sarabun",
  bodyFontSize: "normal",
  headingFontSize: "normal",
  spacingDensity: "normal",
  contentPadding: "none",
  logoSize: "normal",
  blockOrder: DEFAULT_BLOCK_ORDER,
  headerLayout: null,
};

// Pure function — Merge Override ทับ Global เฉพาะ Field ที่ Override ระบุไว้จริง
// (Partial) — Unit Test ได้ตรงๆ ไม่ต้องพึ่ง DB
export function mergeTemplateSettings(
  global: GlobalTemplateSettings,
  override: DocumentTemplateOverride | null | undefined
): GlobalTemplateSettings {
  if (!override) return global;
  return { ...global, ...override };
}

// R6 Phase E — Validate เป็น Permutation ครบถ้วนจริงตอนรับค่าจาก Form ด้วย (ไม่ใช่แค่
// Fallback เงียบๆ ตอนอ่านฝั่ง Print) ให้ User เห็น Error ชัดเจนถ้าเกิดความผิดพลาดจาก
// Client (ไม่ควรเกิดขึ้นได้จริงจาก UI ปกติ แต่ Defense-in-depth เหมือนทุก Field อื่น)
const blockOrderSchema = z
  .array(z.enum(PRINT_BLOCK_KEYS))
  .length(PRINT_BLOCK_KEYS.length)
  .refine((arr) => new Set(arr).size === PRINT_BLOCK_KEYS.length, "ลำดับ Block ไม่ถูกต้อง");

// R6 Phase E.2 — Structural Sanity Check เท่านั้น (ค่าตัวเลขจริงถูก Clamp อีกชั้นผ่าน
// resolveHeaderLayout ก่อนเก็บเสมอ — Defense-in-depth เหมือน blockOrder ด้านบน) —
// ข้อมูลรูปแบบเก่าของ E.1 (มี cell แทน colStart) จะไม่ผ่าน Schema นี้ (ไม่มี colStart)
// แต่ safeParse ที่ actions.ts เรียกผ่าน resolveHeaderLayout ก่อนเสมออยู่แล้ว ไม่ส่ง Raw
// เข้า Schema ตรงๆ — Schema นี้แค่ตรวจ "ค่าที่ Resolve แล้ว" มีรูปร่างถูกต้องก่อนเก็บ
const headerElementStyleSchema = z.object({
  colStart: z.number().int().min(1).max(HEADER_GRID_COLUMNS),
  colSpan: z.number().int().min(1).max(HEADER_GRID_COLUMNS),
  rowStart: z.number().int().min(1).max(HEADER_MAX_ROWS),
  rowSpan: z.number().int().min(1).max(HEADER_MAX_ROWS),
  align: z.enum(HEADER_ALIGN_OPTIONS),
  fontSizePx: z.number(),
  lineHeight: z.number(),
  fontWeight: z.enum(HEADER_FONT_WEIGHT_OPTIONS),
  visible: z.boolean(),
  fontFamily: z.enum(FONT_FAMILY_OPTIONS).optional(),
});
const headerLogoStyleSchema = z.object({
  colStart: z.number().int().min(1).max(HEADER_GRID_COLUMNS),
  colSpan: z.number().int().min(1).max(HEADER_GRID_COLUMNS),
  rowStart: z.number().int().min(1).max(HEADER_MAX_ROWS),
  rowSpan: z.number().int().min(1).max(HEADER_MAX_ROWS),
  align: z.enum(HEADER_ALIGN_OPTIONS),
  visible: z.boolean(),
});
// R6 Phase E.3 — 15 Element ระดับความหมายเดียว (ดู HEADER_ELEMENT_KEYS ด้านบนสำหรับ
// เหตุผลเต็ม) — สร้าง Schema แบบ Generic จาก TEXT_ELEMENT_KEYS แทนพิมพ์ 14 บรรทัดซ้ำ
const headerLayoutSchema = z
  .object(
    Object.fromEntries(TEXT_ELEMENT_KEYS.map((k) => [k, headerElementStyleSchema])) as Record<
      Exclude<HeaderElementKey, "logo">,
      typeof headerElementStyleSchema
    >
  )
  .extend({ logo: headerLogoStyleSchema })
  .nullable();

const overridableSchema = z.object({
  showAddress: z.boolean(),
  showPhone: z.boolean(),
  showTaxId: z.boolean(),
  footerNote: z.string().max(FOOTER_NOTE_MAX_LENGTH),
  fontFamily: z.enum(FONT_FAMILY_OPTIONS),
  bodyFontSize: z.enum(FONT_SIZE_OPTIONS),
  headingFontSize: z.enum(FONT_SIZE_OPTIONS),
  spacingDensity: z.enum(SPACING_DENSITY_OPTIONS),
  contentPadding: z.enum(CONTENT_PADDING_OPTIONS),
  blockOrder: blockOrderSchema,
  headerLayout: headerLayoutSchema,
});

export const globalTemplateSettingsSchema = overridableSchema.extend({
  logoSize: z.enum(LOGO_SIZE_OPTIONS),
});

export const documentTemplateOverrideSchema = overridableSchema.partial();

const APP_SETTING_KEYS = {
  logo: "template.logo",
  global: "template.global",
  override: (docType: DocumentTypeKey) => `template.override.${docType}`,
} as const;

export { APP_SETTING_KEYS as TEMPLATE_SETTING_KEYS };

function parseJsonSafe<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return { ...fallback, ...JSON.parse(value) };
  } catch {
    return fallback;
  }
}

export type ResolvedTemplateSettings = GlobalTemplateSettings & { logo: string | null };

/** อ่าน Global + Override ของ docType ที่ระบุ + Logo แล้ว Merge ให้พร้อมใช้ — จุดเดียว
 * ที่หน้า Print ทั้ง 5 ประเภทต้องเรียก คู่กับ getCompanySettings() เดิมเสมอ */
export async function getPrintTemplateSettings(docType: DocumentTypeKey): Promise<ResolvedTemplateSettings> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: [APP_SETTING_KEYS.logo, APP_SETTING_KEYS.global, APP_SETTING_KEYS.override(docType)] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const global = parseJsonSafe<GlobalTemplateSettings>(map[APP_SETTING_KEYS.global], DEFAULT_GLOBAL_TEMPLATE_SETTINGS);
  const override = map[APP_SETTING_KEYS.override(docType)]
    ? (JSON.parse(map[APP_SETTING_KEYS.override(docType)]) as DocumentTemplateOverride)
    : null;
  const merged = mergeTemplateSettings(global, override);
  // R6 Phase E — Defense-in-depth: กัน blockOrder ที่เสียหาย (แก้ DB มือ/Bug ในอนาคต)
  // ทำให้ Block หายไปจากหน้า Print เงียบๆ — จุดเดียวที่หน้า Print ทั้ง 5 ประเภทเรียกใช้
  const safeBlockOrder = resolveBlockOrder(merged.blockOrder);
  // R6 Phase E.1 — เช่นเดียวกัน กัน headerLayout ที่เสียหายทำให้ Header หาย/ล้นพื้นที่พิมพ์
  const safeHeaderLayout = resolveHeaderLayout(merged.headerLayout);

  return { ...merged, blockOrder: safeBlockOrder, headerLayout: safeHeaderLayout, logo: map[APP_SETTING_KEYS.logo] ?? null };
}

/** อ่านเฉพาะ Global Settings + Logo ดิบๆ (ไม่ Merge Override ใดๆ) — ใช้แสดงในหน้า
 * ตั้งค่า /settings/print-template เท่านั้น */
export async function getGlobalTemplateSettingsRaw(): Promise<{ settings: GlobalTemplateSettings; logo: string | null }> {
  const rows = await db.appSetting.findMany({ where: { key: { in: [APP_SETTING_KEYS.logo, APP_SETTING_KEYS.global] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const settings = parseJsonSafe<GlobalTemplateSettings>(map[APP_SETTING_KEYS.global], DEFAULT_GLOBAL_TEMPLATE_SETTINGS);
  return {
    settings: {
      ...settings,
      blockOrder: resolveBlockOrder(settings.blockOrder),
      headerLayout: resolveHeaderLayout(settings.headerLayout),
    },
    logo: map[APP_SETTING_KEYS.logo] ?? null,
  };
}

/** อ่าน Override ดิบของ docType เดียว (ไม่ Merge กับ Global) — ใช้แสดง Checkbox
 * "ใช้ค่า Global" ในหน้าตั้งค่า (null = ยังไม่เคย Override, ใช้ Global ล้วนๆ) */
export async function getDocumentTemplateOverrideRaw(docType: DocumentTypeKey): Promise<DocumentTemplateOverride | null> {
  const row = await db.appSetting.findUnique({ where: { key: APP_SETTING_KEYS.override(docType) } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as DocumentTemplateOverride;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Logo Validation — PNG/JPEG/WebP เท่านั้น, ≤200KB ก่อน Encode, Reject SVG เสมอ
// (SVG อาจมี <script>/Event Handler ฝังได้ — ความเสี่ยง XSS ตรงๆ ถ้าเอามาแสดงเป็น
// <img>/inline) — Pure Function ไม่พึ่ง DOM/FileReader เพื่อ Unit Test ได้ตรงๆ และ
// ให้ฝั่ง Server เรียกซ้ำได้เหมือนฝั่ง Client (ไม่เชื่อ Client อย่างเดียว)
// ---------------------------------------------------------------------------
const ALLOWED_LOGO_MIME_TO_PREFIX: Record<string, string> = {
  "image/png": "data:image/png;base64,",
  "image/jpeg": "data:image/jpeg;base64,",
  "image/webp": "data:image/webp;base64,",
};
export const LOGO_ALLOWED_MIME_TYPES = Object.keys(ALLOWED_LOGO_MIME_TO_PREFIX);
export const LOGO_MAX_BYTES = 200 * 1024;

export function validateLogoDataUri(dataUri: string): { valid: true } | { valid: false; error: string } {
  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUri);
  if (!match) return { valid: false, error: "รูปแบบไฟล์ไม่ถูกต้อง" };

  const [, mime, base64] = match;
  if (!ALLOWED_LOGO_MIME_TO_PREFIX[mime]) {
    return { valid: false, error: "รองรับเฉพาะไฟล์ PNG, JPEG หรือ WebP เท่านั้น" };
  }

  let byteLength: number;
  try {
    byteLength = Buffer.from(base64, "base64").length;
  } catch {
    return { valid: false, error: "ไม่สามารถอ่านไฟล์รูปได้" };
  }
  if (byteLength > LOGO_MAX_BYTES) {
    return { valid: false, error: `ไฟล์ต้องมีขนาดไม่เกิน ${LOGO_MAX_BYTES / 1024}KB (ไฟล์นี้ ${Math.round(byteLength / 1024)}KB)` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// CSS Var Builder — Map ResolvedTemplateSettings → CSS Custom Properties ที่
// print-page.tsx ฉีดให้ Shared Print Component ที่เหลือทั้งหมด Inherit ผ่านจุดเดียว
// Pure Function — Unit Test ได้ตรงๆ (ยืนยันว่า Default ตรงกับปัจจุบันเป๊ะ)
// ---------------------------------------------------------------------------
export function buildPrintCssVars(settings: OverridableTemplateSettings): Record<string, string> {
  return {
    "--print-font-family": FONT_FAMILY_CSS[settings.fontFamily],
    "--print-body-size": `${BODY_FONT_SIZE_PX[settings.bodyFontSize]}px`,
    "--print-heading-size": `${HEADING_FONT_SIZE_PX[settings.headingFontSize]}px`,
    "--print-row-padding": `${ROW_PADDING_PX[settings.spacingDensity]}px`,
    "--print-block-gap": `${BLOCK_GAP_PX[settings.spacingDensity]}px`,
    "--print-content-padding": `${CONTENT_PADDING_MM[settings.contentPadding]}mm`,
  };
}
