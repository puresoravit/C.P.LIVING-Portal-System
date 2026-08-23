import {
  HEADER_ELEMENT_KEYS,
  HEADER_GRID_COLUMNS,
  HEADER_ROW_UNIT_MM,
  type HeaderElementKey,
  type HeaderElementStyle,
  type HeaderLayoutConfig,
} from "@/lib/print-template-settings";

// R6 Phase E.2 — Grid Container ของ Header Zone (Fine Grid — ดู Comment สถาปัตยกรรมเต็ม
// ใน print-template-settings.ts เหนือ HEADER_GRID_COLUMNS): 100 คอลัมน์ (% ความกว้าง,
// Scale ตาม A4/9×11 อัตโนมัติ) × แถวละเอียด HEADER_ROW_UNIT_MM มม./แถว แบบ
// minmax(Xmm, auto) — ให้ Element วางที่ตำแหน่ง/ขนาดอิสระ (colStart/colSpan/rowStart/
// rowSpan เป็น Grid-unit จำนวนเต็ม) โดยยังเป็น CSS Grid ล้วนๆ ไม่มี Absolute Positioning
// ที่ไหนเลย — Auto-height ตามเนื้อหาจริงเสมอ (minmax ยอมให้แถวโตกว่าค่า Minimum ถ้า
// เนื้อหาต้องการพื้นที่มากกว่า) ทำให้ Element ที่ Render ต่อจาก HeaderZone นี้ (เช่น Item
// Table) ไหลตามหลังไปตาม Document Flow ปกติเสมอ ไม่มีทาง Overlap กับ Header ได้เลย
export function HeaderZone({
  layout,
  elements,
}: {
  layout: HeaderLayoutConfig;
  elements: Record<HeaderElementKey, React.ReactNode>;
}) {
  return (
    <div
      className="mb-[length:var(--print-block-gap)]"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${HEADER_GRID_COLUMNS}, 1fr)`,
        gridAutoRows: `minmax(${HEADER_ROW_UNIT_MM}mm, auto)`,
        position: "relative",
      }}
    >
      {HEADER_ELEMENT_KEYS.map((key) => {
        const style = layout[key];
        if (!style.visible) return null;
        const justify = style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center";
        return (
          <div
            key={key}
            style={{ ...gridPlacementStyle(style), display: "flex", justifyContent: justify, alignItems: "flex-start", minWidth: 0 }}
          >
            <div style={{ textAlign: style.align, minWidth: 0, maxWidth: "100%" }}>{elements[key]}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Pure Function คำนวณ grid-column/grid-row จาก HeaderElementStyle — Export ให้
 * Designer's Interactive Canvas Editor (header-zone-canvas-editor.tsx) เรียกใช้ตัวเดียวกัน
 * เป๊ะ (Single Source of Truth ของ "ตำแหน่งบนกระดาษ = ตำแหน่งที่ลากบน Canvas") กัน
 * Editor คำนวณเองอีกชุดแล้วเพี้ยนจาก Print จริง */
export function gridPlacementStyle(style: Pick<HeaderElementStyle, "colStart" | "colSpan" | "rowStart" | "rowSpan">): React.CSSProperties {
  return {
    gridColumn: `${style.colStart} / span ${style.colSpan}`,
    gridRow: `${style.rowStart} / span ${style.rowSpan}`,
  };
}
