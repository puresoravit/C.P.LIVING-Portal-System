"use client";

import { useRef, useState } from "react";
import {
  HEADER_ELEMENT_KEYS,
  HEADER_GRID_COLUMNS,
  HEADER_ROW_UNIT_MM,
  HEADER_MAX_ROWS,
  COL_SPAN_MIN,
  ROW_SPAN_MIN,
  ROW_SPAN_MAX,
  LOGO_ROW_SPAN_MIN,
  LOGO_ROW_SPAN_MAX,
  type HeaderElementKey,
  type HeaderLayoutConfig,
  type HeaderElementStyle,
} from "@/lib/print-template-settings";
import { gridPlacementStyle } from "@/components/print/header-zone";

// R6 Phase E.2 — Controlled Free-position Header Designer: ลาก/Resize Element ตรงบน
// Canvas จริง (แทน Schematic Grid Editor แยกของ E.1) — ใช้ Pointer Events ธรรมดา
// (mousedown/mousemove/mouseup) ไม่ใช่ HTML5 Drag-and-Drop เพราะต้องอ่านตำแหน่งเมาส์
// "ต่อเนื่อง" ระหว่างลาก (เหมือน Logo Resize Handle เดิมของ E.1) — ตำแหน่ง/ขนาดที่ได้ยัง
// เป็น Grid-unit (Integer) เสมอ (ปัดเศษจาก Pixel Delta ตามอัตราส่วน Container จริง) ไม่ใช่
// Pixel ตรงๆ — คง Invariant เดิมว่าทุกอย่างเป็น Grid-based ไม่มี Absolute Positioning ใน
// ตัวเอกสารเลย (Absolute ที่ใช้ในไฟล์นี้มีเฉพาะ UI Chrome ของ Editor เอง เช่น Resize
// Handle/Guide Line ซึ่งไม่ถูก Render ในหน้า Print จริงเลย — ดู HeaderZone จริงที่ไม่มี
// Absolute Positioning ใดๆ ทั้งสิ้น)
const MM_TO_PX = 96 / 25.4; // ค่าคงที่ CSS mm→px บนจอ (ไม่ผูกกับ Container ใดๆ)
const SNAP_COL_THRESHOLD = 2; // ± 2 หน่วยคอลัมน์ (~2%)
const SNAP_ROW_THRESHOLD = 2; // ± 2 หน่วยแถว (4มม.)

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function rowSpanBoundsFor(key: HeaderElementKey) {
  return key === "logo" ? { min: LOGO_ROW_SPAN_MIN, max: LOGO_ROW_SPAN_MAX } : { min: ROW_SPAN_MIN, max: ROW_SPAN_MAX };
}

function nearestSnap(value: number, candidates: number[], threshold: number): { value: number; snappedAt: number | null } {
  let best: number | null = null;
  let bestDist = threshold + 1;
  for (const c of candidates) {
    const dist = Math.abs(value - c);
    if (dist <= threshold && dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best === null ? { value, snappedAt: null } : { value: best, snappedAt: best };
}

export function HeaderZoneCanvasEditor({
  layout,
  elements,
  selected,
  onSelect,
  onChange,
}: {
  layout: HeaderLayoutConfig;
  elements: Record<HeaderElementKey, React.ReactNode>;
  selected: HeaderElementKey | null;
  onSelect: (key: HeaderElementKey | null) => void;
  onChange: (key: HeaderElementKey, patch: Partial<HeaderElementStyle>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<{ col: number | null; row: number | null }>({ col: null, row: null });

  function colSnapCandidates(excludeKey: HeaderElementKey): number[] {
    const list = [1, HEADER_GRID_COLUMNS + 1];
    for (const k of HEADER_ELEMENT_KEYS) {
      if (k === excludeKey || !layout[k].visible) continue;
      list.push(layout[k].colStart, layout[k].colStart + layout[k].colSpan);
    }
    return list;
  }
  function rowSnapCandidates(excludeKey: HeaderElementKey): number[] {
    const list = [1];
    for (const k of HEADER_ELEMENT_KEYS) {
      if (k === excludeKey || !layout[k].visible) continue;
      list.push(layout[k].rowStart, layout[k].rowStart + layout[k].rowSpan);
    }
    return list;
  }

  function startDrag(e: React.PointerEvent, key: HeaderElementKey, mode: "move" | "resize-col" | "resize-row") {
    e.preventDefault();
    e.stopPropagation();
    onSelect(key);
    const container = containerRef.current;
    if (!container) return;
    const containerWidthPx = container.getBoundingClientRect().width;
    const style = layout[key];
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const { colStart: startColStart, colSpan: startColSpan, rowStart: startRowStart, rowSpan: startRowSpan } = style;
    const rowBounds = rowSpanBoundsFor(key);

    function onMove(ev: PointerEvent) {
      const deltaColUnits = Math.round(((ev.clientX - startClientX) / containerWidthPx) * HEADER_GRID_COLUMNS);
      const deltaRowUnits = Math.round((ev.clientY - startClientY) / (HEADER_ROW_UNIT_MM * MM_TO_PX));

      if (mode === "move") {
        const rawCol = clamp(startColStart + deltaColUnits, 1, HEADER_GRID_COLUMNS - startColSpan + 1);
        const rawRow = clamp(startRowStart + deltaRowUnits, 1, HEADER_MAX_ROWS - startRowSpan + 1);
        const colSnap = nearestSnap(rawCol, colSnapCandidates(key), SNAP_COL_THRESHOLD);
        const rowSnap = nearestSnap(rawRow, rowSnapCandidates(key), SNAP_ROW_THRESHOLD);
        const colStart = clamp(colSnap.value, 1, HEADER_GRID_COLUMNS - startColSpan + 1);
        const rowStart = clamp(rowSnap.value, 1, HEADER_MAX_ROWS - startRowSpan + 1);
        setGuides({ col: colSnap.snappedAt, row: rowSnap.snappedAt });
        onChange(key, { colStart, rowStart });
      } else if (mode === "resize-col") {
        const colSpan = clamp(startColSpan + deltaColUnits, COL_SPAN_MIN, HEADER_GRID_COLUMNS - startColStart + 1);
        onChange(key, { colSpan });
      } else {
        const rowSpan = clamp(startRowSpan + deltaRowUnits, rowBounds.min, rowBounds.max);
        onChange(key, { rowSpan });
      }
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setGuides({ col: null, row: null });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={containerRef}
      onClick={() => onSelect(null)}
      className="relative bg-white"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${HEADER_GRID_COLUMNS}, 1fr)`,
        gridAutoRows: `minmax(${HEADER_ROW_UNIT_MM}mm, auto)`,
      }}
    >
      {HEADER_ELEMENT_KEYS.map((key) => {
        const style = layout[key];
        if (!style.visible) return null;
        const isSelected = selected === key;
        const justify = style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center";
        return (
          <div
            key={key}
            style={{ ...gridPlacementStyle(style), display: "flex", justifyContent: justify, alignItems: "flex-start", minWidth: 0 }}
          >
            <div
              onPointerDown={(e) => startDrag(e, key, "move")}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(key);
              }}
              className={`relative cursor-move select-none ${isSelected ? "outline outline-2 outline-blue-500" : "hover:outline hover:outline-1 hover:outline-blue-300"}`}
              style={{ textAlign: style.align, minWidth: 0, maxWidth: "100%" }}
            >
              {elements[key]}
              {isSelected && (
                <>
                  <div
                    onPointerDown={(e) => startDrag(e, key, "resize-col")}
                    title="ลากเพื่อปรับความกว้าง"
                    className="absolute top-0 -right-1.5 w-3 h-full cursor-ew-resize flex items-center"
                  >
                    <span className="w-1.5 h-6 bg-blue-600 rounded-sm block" />
                  </div>
                  <div
                    onPointerDown={(e) => startDrag(e, key, "resize-row")}
                    title="ลากเพื่อปรับความสูง"
                    className="absolute -bottom-1.5 left-0 w-full h-3 cursor-ns-resize flex justify-center"
                  >
                    <span className="h-1.5 w-6 bg-blue-600 rounded-sm block" />
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      {guides.col !== null && (
        <div className="absolute top-0 bottom-0 w-px bg-pink-500 pointer-events-none" style={{ left: `${((guides.col - 1) / HEADER_GRID_COLUMNS) * 100}%` }} />
      )}
      {guides.row !== null && (
        <div
          className="absolute left-0 right-0 h-px bg-pink-500 pointer-events-none"
          style={{ top: `${(guides.row - 1) * HEADER_ROW_UNIT_MM}mm` }}
        />
      )}
    </div>
  );
}
