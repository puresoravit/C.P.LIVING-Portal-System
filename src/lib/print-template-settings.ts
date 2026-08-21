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

  return { ...merged, logo: map[APP_SETTING_KEYS.logo] ?? null };
}

/** อ่านเฉพาะ Global Settings + Logo ดิบๆ (ไม่ Merge Override ใดๆ) — ใช้แสดงในหน้า
 * ตั้งค่า /settings/print-template เท่านั้น */
export async function getGlobalTemplateSettingsRaw(): Promise<{ settings: GlobalTemplateSettings; logo: string | null }> {
  const rows = await db.appSetting.findMany({ where: { key: { in: [APP_SETTING_KEYS.logo, APP_SETTING_KEYS.global] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    settings: parseJsonSafe<GlobalTemplateSettings>(map[APP_SETTING_KEYS.global], DEFAULT_GLOBAL_TEMPLATE_SETTINGS),
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
