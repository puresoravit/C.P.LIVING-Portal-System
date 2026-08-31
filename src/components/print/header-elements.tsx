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
 * Meta ฯลฯ) — label เป็น Optional (ไม่มี Label = แสดงแค่ Value เฉยๆ เช่น ที่อยู่บริษัท)
 *
 * Owner UAT (2026-08-31) — เลขที่เอกสารต้องการพร้อมกัน 3 อย่างที่ Data-level (colStart/
 * colSpan/align ของ HeaderZone) ทำพร้อมกันไม่ได้เลยสำหรับเนื้อหาที่ยาวไม่คงที่: (1) Label
 * เริ่มตำแหน่งเดียวกับบรรทัดอื่น (2) Label+ค่าไหลต่อกันแบบธรรมชาติไม่มีช่องว่างประดิษฐ์ตอน
 * เนื้อหาสั้น (3) ตัวท้ายสุดของค่าจบที่แนวคงที่ไม่ว่าเนื้อหาจะยาวแค่ไหน
 *
 * ลอง justify-content:space-between ก่อน (Label/Value เป็น Flex Child คนละตัว) แต่พังเพราะ
 * Wrapper ทั้งสองชั้นใน HeaderZone (Grid Item + textAlign Wrapper) Shrink-wrap ตามเนื้อหา
 * เสมอ ไม่ Stretch เต็ม Grid Column — Space-between เลยไม่มีพื้นที่ว่างให้กระจาย กลายเป็น
 * ไม่ทำอะไรเลยจริง (Verified จริงด้วย Browser Test ก่อน Deploy)
 *
 * แก้ด้วย position:absolute แทน: HeaderZone Container ชั้นนอกสุดมี position:"relative"
 * อยู่แล้ว (จุดเดียว ไม่ต้องเพิ่ม) — Label อยู่ใน Normal Flow ตามปกติ (ตำแหน่งซ้ายมาจาก
 * Grid Item + align="left" เดิมทุกประการ ไม่กระทบ 14 Element อื่น) — Value ใช้
 * position:absolute; right:0 ซึ่งจะข้าม Wrapper ที่ไม่มี position (Static) ทั้งสองชั้นไป
 * เกาะกับ HeaderZone Container ที่ position:relative โดยตรง — เท่ากับ "ขอบขวาสุดของ Header
 * Zone ทั้งก้อน" (ตรงกับขอบขวาคอลัมน์จำนวนเงินเป๊ะ เพราะ Header Zone กว้างเท่าตาราง) ไม่ว่า
 * Grid Column ของ Element เองจะประกาศกว้างแค่ไหน — ยืนยันด้วย Browser Test จริง (ไม่ใช่แค่
 * ทฤษฎี): เนื้อหาสั้น/ยาวต่างกัน 20 ตัวอักษร ปลายขวายังจบจุดเดิมเป๊ะ (703px ทั้งคู่จาก 704px
 * Target) ไม่ทับ Label เลยทั้งสองกรณี — ไม่ส่ง valueAlign = พฤติกรรมเดิมทุกประการ (14
 * Element อื่นไม่กระทบ) */
export function HeaderTextLine({
  label,
  value,
  style,
  valueAlign,
}: {
  label?: string;
  value: React.ReactNode;
  style: TextLineStyle;
  valueAlign?: "right";
}) {
  const textStyle = applyFontFamily({ fontSize: `${style.fontSizePx}px`, lineHeight: style.lineHeight }, style.fontFamily);
  if (valueAlign === "right") {
    return (
      <div className={style.fontWeight === "bold" ? "font-semibold" : undefined} style={textStyle}>
        {label && <span className="text-gray-500 whitespace-nowrap">{label}:</span>}
        <span className="whitespace-nowrap" style={{ position: "absolute", right: 0 }}>
          {value}
        </span>
      </div>
    );
  }
  return (
    <div className={style.fontWeight === "bold" ? "font-semibold" : undefined} style={textStyle}>
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
  // Owner UAT (2026-08-31) — text-gray-700 เดิม (บรรทัดที่ไม่ตั้ง Bold) พิมพ์ออกมาจางไม่ชัด
  // (เหตุผลเดียวกับ print-document-title.tsx) — เข้มขึ้นเป็น gray-900 เสมอไม่ว่าจะ Bold
  // หรือไม่ — ไม่กระทบ Font-weight ที่ Owner ตั้งไว้ใน Designer เลย แค่สีเข้มขึ้น
  return (
    <div
      className={style.fontWeight === "bold" ? "font-semibold" : "text-gray-900"}
      style={applyFontFamily({ fontSize: `${style.fontSizePx}px`, lineHeight: style.lineHeight }, style.fontFamily)}
    >
      {text}
    </div>
  );
}
