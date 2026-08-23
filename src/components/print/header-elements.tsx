import { FONT_FAMILY_CSS, type FontFamilyKey, type HeaderElementStyle } from "@/lib/print-template-settings";

// R6 Phase E.1/E.2/E.3 — Element อะตอมที่ HeaderZone (header-zone.tsx) จัดวางลง Grid ให้ —
// แต่ละตัวรับผิดชอบแค่ "เนื้อหา + Typography ของตัวเอง" เท่านั้น ไม่รู้เรื่อง Alignment/
// ตำแหน่ง/ความกว้างเลย (HeaderZone เป็นคนห่อ Wrapper ที่คุมเรื่องนั้นให้แทน จุดเดียว) —
// Reuse เดิมกับหน้า Print จริงและ Designer's Live Preview ทั้งคู่เสมอ (Single Rendering
// Source เหมือน Phase E เดิมทุกประการ)
//
// R6 Phase E.3 — Semantic Element Free Layout แตกจาก 6 Block เดิมเป็น 15 Element ระดับ
// บรรทัดเดียว (ดู HEADER_ELEMENT_KEYS ใน print-template-settings.ts) — ใช้ 2 Component
// อะตอมกลาง (HeaderTextLine/HeaderTitleLine) แทนการเขียน Component แยกทุก Element (ซึ่งจะ
// เกือบซ้ำกันหมด ต่างแค่ Label) — รับ Prop "style" เป็นก้อนเดียว (Pick จาก
// HeaderElementStyle) แทนแยก fontSizePx/lineHeight/fontFamily 3 Prop ลด Boilerplate ที่
// จุดเรียกใช้ (หน้า Print จริง 5 ไฟล์ + Designer Canvas ที่ต้องเรียก 15 Element ต่อไฟล์)

export type TextLineStyle = Pick<HeaderElementStyle, "fontSizePx" | "lineHeight" | "fontFamily" | "fontWeight">;

function applyFontFamily(style: React.CSSProperties, fontFamily?: FontFamilyKey): React.CSSProperties {
  return fontFamily ? { ...style, fontFamily: FONT_FAMILY_CSS[fontFamily] } : style;
}

export function HeaderLogoElement({ logo, heightMm }: { logo?: string | null; heightMm: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Data URI จาก AppSetting หรือไฟล์ static ธรรมดา
    <img src={logo || "/logo.jpg"} alt="" style={{ height: `${heightMm}mm`, width: "auto" }} className="object-contain" />
  );
}

/** Element ข้อความทั่วไป 1 บรรทัด — ใช้กับ Element ส่วนใหญ่ (Company/Customer/Document
 * Meta ฯลฯ) — label เป็น Optional (ไม่มี Label = แสดงแค่ Value เฉยๆ เช่น ที่อยู่บริษัท) */
export function HeaderTextLine({ label, value, style }: { label?: string; value: React.ReactNode; style: TextLineStyle }) {
  return (
    <div
      className={style.fontWeight === "bold" ? "font-semibold" : undefined}
      style={applyFontFamily({ fontSize: `${style.fontSizePx}px`, lineHeight: style.lineHeight }, style.fontFamily)}
    >
      {label && <span className="text-gray-500">{label}: </span>}
      {value}
    </div>
  );
}

/** Element ชื่อเอกสาร (ไทย/อังกฤษ) — แยกเป็นคนละ Element ตั้งแต่ R6 Phase E.3 (เดิมรวมกัน
 * เป็น "title" Block เดียว) เพื่อให้จัดกึ่งกลาง/ขนาด/ระยะห่างแยกจากกันได้อิสระตามที่ Owner
 * ระบุตรงๆ ("Thai/English title ต้องเป็นคนละ Element") — R6 Phase E.3 Follow-up: fontWeight
 * ย้ายมาเป็น Field ปกติใน style (ปรับได้อิสระต่อบรรทัดจาก Properties Bar) แทน Prop `bold`
 * Hardcode เดิม (เคย Fix ไว้ว่าไทยหนา/อังกฤษไม่หนาเสมอ) — ค่าเริ่มต้นใน
 * DEFAULT_HEADER_LAYOUT ยังคง Map ให้ตรงพฤติกรรมเดิมเป๊ะ (Zero-Regression) */
export function HeaderTitleLine({ text, style }: { text: string; style: TextLineStyle }) {
  return (
    <div
      className={style.fontWeight === "bold" ? "font-semibold" : "text-gray-700"}
      style={applyFontFamily({ fontSize: `${style.fontSizePx}px`, lineHeight: style.lineHeight }, style.fontFamily)}
    >
      {text}
    </div>
  );
}
