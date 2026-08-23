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
// R6 Phase E.1 — Header Free Layout Enhancement
// เฉพาะพื้นที่ "เหนือ Item Table" (เดิมคือ Block header/title/customerInfo ของ Phase E)
// แตกละเอียดขึ้นเป็น 6 Element อิสระ วางได้ใน Grid 3 แถว × 2 คอลัมน์ = 6 ช่อง (Safe
// Zone แบบปิด ไม่ใช่ Pixel Coordinate อิสระ) — ทุก Element ครองคนละช่องเสมอ (Bijection
// เต็มจำนวน 6:6) ทำให้ "ห้าม Overlap" เป็นจริงโดยโครงสร้าง Grid เอง ไม่ต้องมี Collision
// Detection แยกต่างหาก — แต่ละช่องเป็น CSS Grid Row แบบ height:auto จึงสูงตามเนื้อหาจริง
// เสมอ (ไม่มี Absolute Positioning ที่ไหนเลย) ทำให้ Item Table ที่ตามมาหลัง Grid นี้ถูก
// "ดัน" ลงตามธรรมชาติของ Document Flow โดยไม่ต้องคำนวณ Offset เอง
//
// headerLayout = null (Default ของทุกเอกสารที่ไม่เคยตั้งค่า) หมายถึง "ยังไม่ใช้ระบบใหม่"
// — หน้า Print จริงทั้ง 5 จะ Render ผ่าน Path เดิมของ Phase E เป๊ะ (PrintOrderedBlocks +
// header/title/customerInfo 3 Block เดิม) ไม่แตะโค้ดเดิมแม้แต่บรรทัดเดียว = Zero
// Regression รับประกันโดยไม่ต้อง Diff สายตา — เฉพาะเอกสารที่ Owner เปิดโหมด "Header
// Layout แบบละเอียด" ผ่าน Designer เท่านั้นที่จะมี headerLayout ไม่เป็น null แล้วเปลี่ยน
// ไป Render ผ่าน HeaderZone Component ใหม่แทน
// ==========================================================================

export const HEADER_ELEMENT_KEYS = [
  "logo",
  "companyInfo",
  "title",
  "docNumberDate",
  "customerName",
  "customerDetails",
] as const;
export type HeaderElementKey = (typeof HEADER_ELEMENT_KEYS)[number];
export const HEADER_ELEMENT_LABELS: Record<HeaderElementKey, string> = {
  logo: "โลโก้",
  companyInfo: "ชื่อ + ข้อมูลบริษัท",
  title: "ชื่อเอกสาร",
  docNumberDate: "เลขที่ + วันที่เอกสาร",
  customerName: "ชื่อลูกค้า",
  customerDetails: "ที่อยู่ / เลขผู้เสียภาษี / สถานที่ส่งสินค้า",
};

export const HEADER_ALIGN_OPTIONS = ["left", "center", "right"] as const;
export type HeaderAlignKey = (typeof HEADER_ALIGN_OPTIONS)[number];
export const HEADER_ALIGN_LABELS: Record<HeaderAlignKey, string> = { left: "ซ้าย", center: "กลาง", right: "ขวา" };

/** ช่องใน Grid 3 แถว×2 คอลัมน์ ระบุด้วย Index 0-5 (row = floor(cell/2), col = cell%2) */
export type HeaderGridCell = 0 | 1 | 2 | 3 | 4 | 5;
export const HEADER_GRID_ROWS = 3;
export const HEADER_GRID_COLS = 2;

export const LINE_HEIGHT_MIN = 1.0;
export const LINE_HEIGHT_MAX = 2.0;
export const MAX_WIDTH_PCT_MIN = 30;
export const MAX_WIDTH_PCT_MAX = 100;
export const LOGO_HEIGHT_MIN_PX = 20;
export const LOGO_HEIGHT_MAX_PX = 90;

/** ขอบเขต Font Size ปลอดภัยของแต่ละ Element แยกกัน (ตามที่ Owner ระบุตรงๆ ว่าแต่ละ
 * Element ต้องมี Min/Max ของตัวเอง) — title กว้างสุดเพราะเป็นหัวเรื่องเด่นของเอกสาร,
 * customerDetails แคบสุดเพราะเป็นข้อมูลรองที่มักมีหลายบรรทัด */
export const HEADER_FONT_SIZE_BOUNDS: Record<Exclude<HeaderElementKey, "logo">, { min: number; max: number }> = {
  companyInfo: { min: 8, max: 20 },
  title: { min: 10, max: 28 },
  docNumberDate: { min: 8, max: 16 },
  customerName: { min: 8, max: 18 },
  customerDetails: { min: 7, max: 14 },
};

export type HeaderElementStyle = {
  cell: HeaderGridCell;
  align: HeaderAlignKey;
  fontSizePx: number;
  lineHeight: number;
  maxWidthPct: number;
  visible: boolean;
};
export type HeaderLogoStyle = Omit<HeaderElementStyle, "fontSizePx"> & { heightPx: number };

export type HeaderLayoutConfig = {
  logo: HeaderLogoStyle;
  companyInfo: HeaderElementStyle;
  title: HeaderElementStyle;
  docNumberDate: HeaderElementStyle;
  customerName: HeaderElementStyle;
  customerDetails: HeaderElementStyle;
};

// Default Cell Arrangement เมื่อ Owner เพิ่งเปิดโหมด Custom ครั้งแรก (จุดเริ่มต้นที่
// สมเหตุสมผล ไม่จำเป็นต้องตรงกับ Layout เดิมของ Path Classic เป๊ะ เพราะเป็นคนละ Mode ที่
// ต้องเปิดใช้งานเองอย่างชัดเจน): แถวบน=แบรนด์ (โลโก้ซ้าย, บริษัทกลาง), แถวกลาง=เอกสาร
// (ชื่อเอกสารซ้าย, เลขที่/วันที่ขวา), แถวล่าง=ลูกค้า (ชื่อซ้าย, รายละเอียดขวา)
export const DEFAULT_HEADER_LAYOUT: HeaderLayoutConfig = {
  logo: { cell: 0, align: "left", heightPx: 44, lineHeight: 1, maxWidthPct: 100, visible: true },
  companyInfo: { cell: 1, align: "center", fontSizePx: 12, lineHeight: 1.3, maxWidthPct: 100, visible: true },
  title: { cell: 2, align: "left", fontSizePx: 14, lineHeight: 1.2, maxWidthPct: 100, visible: true },
  docNumberDate: { cell: 3, align: "right", fontSizePx: 12, lineHeight: 1.4, maxWidthPct: 100, visible: true },
  customerName: { cell: 4, align: "left", fontSizePx: 12, lineHeight: 1.3, maxWidthPct: 100, visible: true },
  customerDetails: { cell: 5, align: "left", fontSizePx: 11, lineHeight: 1.4, maxWidthPct: 100, visible: true },
};

function clampNum(n: unknown, min: number, max: number, fallback: number): number {
  const num = Number(n);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
}

function resolveAlign(raw: unknown, fallback: HeaderAlignKey): HeaderAlignKey {
  return (HEADER_ALIGN_OPTIONS as readonly string[]).includes(raw as string) ? (raw as HeaderAlignKey) : fallback;
}

/** ตรวจ + Clamp HeaderLayoutConfig ที่ได้จาก AppSetting/Client เสมอก่อนใช้งานจริง —
 * null/undefined = โหมด Classic (ไม่ใช่ข้อมูลเสีย) คืน null ตรงๆ — ถ้ามีค่าแต่ Cell ไม่
 * ครบเป็น Permutation ของ 0-5 (ข้อมูลเสีย/แก้ DB มือ) Fallback ทั้งชุดไป
 * DEFAULT_HEADER_LAYOUT (ยังอยู่ใน Custom Mode แต่กลับไปที่ค่าเริ่มต้นที่ปลอดภัย ไม่ใช่
 * หลุดกลับไป Classic Mode เงียบๆ) — ทุก Field ตัวเลข Clamp ภายใน Safe Bounds ของตัวเอง
 * เสมอ กัน Font Size/ความสูงโลโก้ที่ผิดพลาด/ถูกแก้เกินขอบเขตทำให้ Header ล้นพื้นที่พิมพ์ */
export function resolveHeaderLayout(raw: unknown): HeaderLayoutConfig | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return DEFAULT_HEADER_LAYOUT;
  const obj = raw as Record<string, any>;

  const cells = HEADER_ELEMENT_KEYS.map((k) => Number(obj[k]?.cell));
  const validCellSet =
    cells.every((c) => Number.isInteger(c) && c >= 0 && c <= 5) && new Set(cells).size === HEADER_ELEMENT_KEYS.length;
  if (!validCellSet) return DEFAULT_HEADER_LAYOUT;

  const cellByKey = Object.fromEntries(HEADER_ELEMENT_KEYS.map((k, i) => [k, cells[i] as HeaderGridCell])) as Record<
    HeaderElementKey,
    HeaderGridCell
  >;

  function resolveTextElement(key: Exclude<HeaderElementKey, "logo">): HeaderElementStyle {
    const bounds = HEADER_FONT_SIZE_BOUNDS[key];
    const fallback = DEFAULT_HEADER_LAYOUT[key];
    const r = obj[key] ?? {};
    return {
      cell: cellByKey[key],
      align: resolveAlign(r.align, fallback.align),
      fontSizePx: clampNum(r.fontSizePx, bounds.min, bounds.max, fallback.fontSizePx),
      lineHeight: clampNum(r.lineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, fallback.lineHeight),
      maxWidthPct: clampNum(r.maxWidthPct, MAX_WIDTH_PCT_MIN, MAX_WIDTH_PCT_MAX, fallback.maxWidthPct),
      visible: typeof r.visible === "boolean" ? r.visible : true,
    };
  }

  const logoRaw = obj.logo ?? {};
  return {
    logo: {
      cell: cellByKey.logo,
      align: resolveAlign(logoRaw.align, DEFAULT_HEADER_LAYOUT.logo.align),
      heightPx: clampNum(logoRaw.heightPx, LOGO_HEIGHT_MIN_PX, LOGO_HEIGHT_MAX_PX, DEFAULT_HEADER_LAYOUT.logo.heightPx),
      lineHeight: 1,
      maxWidthPct: 100,
      visible: typeof logoRaw.visible === "boolean" ? logoRaw.visible : true,
    },
    companyInfo: resolveTextElement("companyInfo"),
    title: resolveTextElement("title"),
    docNumberDate: resolveTextElement("docNumberDate"),
    customerName: resolveTextElement("customerName"),
    customerDetails: resolveTextElement("customerDetails"),
  };
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

// R6 Phase E.1 — Structural Sanity Check เท่านั้น (ค่าตัวเลขจริงถูก Clamp อีกชั้นผ่าน
// resolveHeaderLayout ก่อนเก็บเสมอ — Defense-in-depth เหมือน blockOrder ด้านบน)
const headerElementStyleSchema = z.object({
  cell: z.number().int().min(0).max(5),
  align: z.enum(HEADER_ALIGN_OPTIONS),
  fontSizePx: z.number(),
  lineHeight: z.number(),
  maxWidthPct: z.number(),
  visible: z.boolean(),
});
const headerLogoStyleSchema = z.object({
  cell: z.number().int().min(0).max(5),
  align: z.enum(HEADER_ALIGN_OPTIONS),
  heightPx: z.number(),
  lineHeight: z.number(),
  maxWidthPct: z.number(),
  visible: z.boolean(),
});
const headerLayoutSchema = z
  .object({
    logo: headerLogoStyleSchema,
    companyInfo: headerElementStyleSchema,
    title: headerElementStyleSchema,
    docNumberDate: headerElementStyleSchema,
    customerName: headerElementStyleSchema,
    customerDetails: headerElementStyleSchema,
  })
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
