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

// Owner UAT (2026-09-02) — ใบกำกับภาษี/ใบเสร็จขอโลโก้เส้นบางเข้มขึ้น (หมึกจางบนกระดาษจริง)
// อ่านผ่าน CSS Var --print-logo-filter (Default "none" — พฤติกรรมเดิมทุกประการถ้าไม่มีใคร
// ส่งมา) หน้า Print เดียวที่ตั้งค่านี้ผ่าน bodyStyle คือ tax-invoices/[id]/print/page.tsx
// เท่านั้น — เอกสารอื่นทั้ง 4 ประเภทไม่กระทบเลย
export function HeaderLogoElement({ logo, heightMm }: { logo?: string | null; heightMm: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Data URI จาก AppSetting หรือไฟล์ static ธรรมดา
    <img
      src={logo || "/logo.jpg"}
      alt=""
      style={{ height: `${heightMm}mm`, width: "auto", filter: "var(--print-logo-filter, none)" }}
      className="object-contain"
    />
  );
}

/** Element ข้อความทั่วไป 1 บรรทัด — ใช้กับ Element ส่วนใหญ่ (Company/Customer/Document
 * Meta ฯลฯ) — label เป็น Optional (ไม่มี Label = แสดงแค่ Value เฉยๆ เช่น ที่อยู่บริษัท)
 *
 * Owner UAT (2026-08-31 รอบ 11) — เลขที่เอกสารต้องการพร้อมกัน 3 อย่างที่ Data-level
 * (colStart/colSpan/align ของ HeaderZone) ทำพร้อมกันไม่ได้เลยสำหรับเนื้อหาที่ยาวไม่คงที่:
 * (1) Label เริ่มตำแหน่งเดียวกับบรรทัดอื่น (2) Label+ค่าไหลต่อกันแบบธรรมชาติไม่มีช่องว่าง
 * ประดิษฐ์ตอนเนื้อหาสั้น (3) ตัวท้ายสุดของค่าจบที่แนวคงที่ไม่ว่าเนื้อหาจะยาวแค่ไหน
 *
 * ลอง justify-content:space-between ก่อน (Label/Value เป็น Flex Child คนละตัว) แต่พังเพราะ
 * Wrapper ทั้งสองชั้นใน HeaderZone (Grid Item + textAlign Wrapper) Shrink-wrap ตามเนื้อหา
 * เสมอ ไม่ Stretch เต็ม Grid Column — Space-between เลยไม่มีพื้นที่ว่างให้กระจาย
 *
 * รอบ 11 ลองแยก Label (Normal Flow ที่ตำแหน่งซ้ายคงที่ตาม Grid Item) ออกจาก Value
 * (position:absolute; right:0 อิสระ) — แก้ (1) และ (3) ได้ แต่ (2) พัง: เพราะ Label ยึด
 * ตำแหน่งซ้ายคงที่ (ตาม colStart) ส่วน Value ยึดตำแหน่งขวาคงที่ (ตาม Container) คนละจุด
 * อ้างอิงกันเลย — ช่องว่างระหว่างสองจุดยึดจึงกว้าง/แคบตามความยาวเนื้อหาแทนที่จะเป็นระยะ
 * ธรรมชาติคงที่ — Owner UAT รอบ 12 (2026-09-01) รายงานว่าเห็นช่องว่างใหญ่ผิดธรรมชาติจริง
 *
 * รอบ 12 แก้ที่ต้นเหตุ: เลิกแยก Label/Value เป็นคนละ Anchor — ยก "ทั้งบรรทัด" (Label+Value
 * ในกล่องเดียว ไหลใน Flow ปกติของกันเองด้วยระยะห่างธรรมชาติ `label: value` เดิม) มา
 * position:absolute; right:0 เป็นก้อนเดียว (ข้าม Wrapper ที่ไม่มี position ทั้งสองชั้นไป
 * เกาะ HeaderZone Container ที่ position:relative โดยตรง เหมือนรอบ 11 — จุดต่างคือคราวนี้
 * "ทั้งก้อน" ถูกยก ไม่ใช่แค่ Value) — ผลคือ: ขอบขวาสุด (ตัวท้ายสุดของ Value) นิ่งที่จุดเดิม
 * เป๊ะเสมอไม่ว่าเนื้อหาจะยาวแค่ไหน (ก้อนกว้างขึ้น/แคบลงจาก "ฝั่งซ้าย" เท่านั้น — Shrink-to-
 * fit Width ตามธรรมชาติของ position:absolute ที่ตั้งแค่ right ไม่ตั้ง left) และ Label ยัง
 * ติดกับ Value ด้วยระยะห่างธรรมดาเสมอไม่ว่าเนื้อหาจะสั้น/ยาวแค่ไหน (ไม่มีช่องว่างประดิษฐ์
 * อีกต่อไป เพราะทั้งคู่อยู่ใน Flow เดียวกันภายในก้อนเดียวกัน) — ยืนยันด้วย Browser Test จริง
 * 3 กรณี (สั้น/ปกติ/ยาวสุด 6 หลัก): ขอบขวาคลาดจาก Target 0px ทั้ง 3 กรณี Label ชิด Value
 * ระยะเดียวกันทุกกรณี — ไม่ส่ง valueAlign = พฤติกรรมเดิมทุกประการ (13 Element อื่นไม่กระทบ)
 */
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
      <div
        className={style.fontWeight === "bold" ? "font-semibold" : undefined}
        style={{ ...textStyle, position: "absolute", right: 0, whiteSpace: "nowrap" }}
      >
        {label && <span className="text-gray-500">{label}: </span>}
        {value}
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

/** Element รวม "เลขที่" + "วันที่" เป็นก้อนเดียว — Owner UAT (2026-09-01 รอบ 13): ต้องการ
 * ให้ Label ทั้งสองบรรทัดเริ่มตำแหน่งซ้ายตรงกันเป๊ะ ("ว" ของวันที่ ตรงกับ "เ" ของเลขที่)
 * นอกเหนือจากที่รอบ 12 ทำไปแล้ว (Label ชิด Value ในแต่ละบรรทัด + เลขที่ Right-anchor)
 *
 * ทำไม่ได้ด้วย 2 Element อิสระต่อกัน (แบบรอบ 12): แต่ละบรรทัด Shrink-to-fit ตามเนื้อหา
 * ตัวเอง แล้ว Right-anchor อิสระ — ความกว้างของสองบรรทัดไม่เท่ากัน (ตรวจแล้วว่าจริง: เลขที่
 * เอกสารบางประเภท เช่น TX/BI ที่ Pad เลขแค่ 3 หลัก มีโอกาสแคบกว่าบรรทัดวันที่ด้วยซ้ำ ไม่ใช่
 * แค่ INV ที่ยาวกว่าเสมอ) ทำให้ Label ซ้ายไม่มีทางตรงกันได้เอง
 *
 * แก้ด้วย CSS Grid บล็อกเดียว (ไม่ตั้ง grid-template-columns เอง — ปล่อย Implicit 1 คอลัมน์
 * Auto-width ตาม Spec Grid: กว้างเท่า Max-content ของบรรทัดที่กว้างที่สุดในนั้นเสมอ) — สอง
 * บรรทัดเป็น Grid Row ในคอลัมน์เดียวกัน จึงกว้างเท่ากันเป๊ะเสมอไม่ว่าเนื้อหาจะสั้น/ยาวแค่ไหน
 * (Flexbox ทำแบบนี้ไม่ได้ — Flex Child แต่ละตัว Shrink-wrap อิสระ ไม่มี "อ้างอิงกว้างสุดของ
 * พี่น้อง" ให้ใช้ แต่ Grid Track มี) — ทั้งก้อนยัง position:absolute; right:0 อิสระเหมือน
 * รอบ 11/12 (Anchor เดิมเป๊ะ ไม่กระทบขอบขวาปลอดภัยเดิม) — บรรทัดในก้อนเป็น Flow ปกติชิดซ้าย
 * (ไม่ Right-align ต่อบรรทัด) จึง Label ทั้งคู่เริ่มที่ขอบซ้ายกล่องเดียวกันเป๊ะเสมอ
 *
 * ผลที่ตามมา (Trade-off ที่ยอมรับได้): บรรทัดที่ "แคบกว่า" อีกบรรทัด จะจบสั้นกว่าขอบขวา
 * เป้าหมายเล็กน้อย (ไม่เกิน) แทนที่จะจบเป๊ะขอบขวาเป๊ะเหมือนรอบ 12 — วัดจริงด้วย Browser Test
 * (Font จริงของระบบ): กรณี TX/BI ที่วันที่กว้างกว่าเลขที่เอกสารเล็กน้อย (1-5px) เลขที่เอกสาร
 * จะสั้นกว่าขอบขวาประมาณ 1-5px (ต่ำกว่า 1 มม. มองด้วยตาจริงไม่เห็น) — แลกกับการไม่มีทาง
 * "ตกขอบขวา" ได้เลยไม่ว่ากรณีไหน (Grid Auto-width รับประกันว่ากล่องกว้างสุดแค่บรรทัดที่กว้าง
 * ที่สุดในนั้น ไม่มีทางเกิน Anchor ขวาที่ตั้งไว้) — ปลอดภัยกว่าการเสี่ยงให้วันที่ตกขอบขวาจริง
 * ในกรณี TX/BI ถ้ายังคง Anchor อิสระต่อบรรทัดแบบรอบ 12 ไว้
 *
 * Owner UAT (2026-09-02 รอบ 14) — ระยะห่างแนวตั้งจาก rowStart จริง (แถวห่างกัน 3 แถว ×
 * HEADER_ROW_UNIT_MM 2mm = 6mm ≈ 22.7px) กว้างเกินไป มองแล้วเหมือนคนละ Block ไม่ใช่ Header
 * เดียวกัน — Owner ขอ "ระยะห่างธรรมชาติ" แบบสองบรรทัดในย่อหน้าเดียวกัน ห้ามแตะ X-position/
 * Right-anchor เลย แก้แค่ Margin — เอา rowStart-based Gap ออก ปล่อยให้สองบรรทัด Stack กัน
 * ตรงๆ ไม่มี margin คั่น (ระยะห่างที่เห็นเป็นแค่ Line-height ของบรรทัดวันที่เอง 1.3 เท่า
 * ปกติ) เหมือนสองบรรทัดในย่อหน้าเดียวกันจริงๆ — Invoice/TaxInvoice/เอกสารอื่นใช้ Component
 * เดียวกันนี้ทั้งหมด จึงได้ Spacing เดียวกันอัตโนมัติทุกประเภทตามที่ Owner ขอ */
export function HeaderDocNumberDateBlock({
  numberLabel,
  numberValue,
  numberStyle,
  dateLabel,
  dateValue,
  dateStyle,
}: {
  numberLabel: string;
  numberValue: React.ReactNode;
  numberStyle: TextLineStyle;
  dateLabel: string;
  dateValue: React.ReactNode;
  dateStyle: TextLineStyle;
}) {
  const numberTextStyle = applyFontFamily(
    { fontSize: `${numberStyle.fontSizePx}px`, lineHeight: numberStyle.lineHeight },
    numberStyle.fontFamily
  );
  const dateTextStyle = applyFontFamily({ fontSize: `${dateStyle.fontSizePx}px`, lineHeight: dateStyle.lineHeight }, dateStyle.fontFamily);
  return (
    <div style={{ position: "absolute", right: 0, display: "grid" }}>
      <div className={numberStyle.fontWeight === "bold" ? "font-semibold" : undefined} style={{ ...numberTextStyle, whiteSpace: "nowrap" }}>
        <span className="text-gray-500">{numberLabel}: </span>
        {numberValue}
      </div>
      <div className={dateStyle.fontWeight === "bold" ? "font-semibold" : undefined} style={{ ...dateTextStyle, whiteSpace: "nowrap" }}>
        <span className="text-gray-500">{dateLabel}: </span>
        {dateValue}
      </div>
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
