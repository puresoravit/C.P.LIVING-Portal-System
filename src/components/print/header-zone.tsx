import {
  HEADER_ELEMENT_KEYS,
  HEADER_GRID_COLS,
  type HeaderElementKey,
  type HeaderLayoutConfig,
} from "@/lib/print-template-settings";

// R6 Phase E.1 — Grid Container ของ Header Zone: 3 แถว × 2 คอลัมน์ = 6 ช่อง, ทุก
// Element ครองคนละช่องเสมอ (Bijection เต็มจำนวนที่ resolveHeaderLayout รับประกันไว้แล้ว)
// จึง "ห้าม Overlap" เป็นจริงโดยโครงสร้าง Grid เอง — ทุกแถวเป็น auto (สูงตามเนื้อหาจริง)
// ไม่มี Absolute Positioning ที่ไหนเลย ทำให้ Element ที่ Render ต่อจาก HeaderZone นี้ (เช่น
// Item Table) ไหลตามหลังไปตาม Document Flow ปกติเสมอ — Wrapper รอบแต่ละ Element เป็นคน
// คุม Alignment (justify-content ตำแหน่งในช่อง + text-align ของเนื้อหา) และ Max-width
// (% ของความกว้างช่อง ให้ข้อความยาว Wrap แทนล้นออกนอกช่อง) ให้แทน ตัว Element อะตอมเอง
// (header-elements.tsx) ไม่ต้องรู้เรื่องนี้เลย
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
      style={{ display: "grid", gridTemplateColumns: `repeat(${HEADER_GRID_COLS}, 1fr)`, columnGap: "12px", rowGap: "4px" }}
    >
      {HEADER_ELEMENT_KEYS.map((key) => {
        const style = layout[key];
        if (!style.visible) return null;
        const row = Math.floor(style.cell / HEADER_GRID_COLS) + 1;
        const col = (style.cell % HEADER_GRID_COLS) + 1;
        const justify = style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center";
        return (
          <div key={key} style={{ gridRow: row, gridColumn: col, display: "flex", justifyContent: justify, minWidth: 0 }}>
            <div style={{ textAlign: style.align, maxWidth: `${style.maxWidthPct}%`, minWidth: 0 }}>{elements[key]}</div>
          </div>
        );
      })}
    </div>
  );
}
