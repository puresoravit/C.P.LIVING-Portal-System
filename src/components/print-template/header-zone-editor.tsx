"use client";

import { useState } from "react";
import {
  HEADER_ELEMENT_KEYS,
  HEADER_ELEMENT_LABELS,
  HEADER_ALIGN_OPTIONS,
  HEADER_ALIGN_LABELS,
  HEADER_GRID_COLS,
  HEADER_FONT_SIZE_BOUNDS,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  MAX_WIDTH_PCT_MIN,
  MAX_WIDTH_PCT_MAX,
  LOGO_HEIGHT_MIN_PX,
  LOGO_HEIGHT_MAX_PX,
  type HeaderElementKey,
  type HeaderLayoutConfig,
  type HeaderAlignKey,
} from "@/lib/print-template-settings";

// R6 Phase E.1 — Header Zone Editor: ตัวแทนภาพ (Schematic) ของ Grid 3×2 ที่ HeaderZone
// จริงใช้ Render — แยกออกจาก Live Preview Canvas โดยเจตนา (Canvas ด้านล่างแสดงผลจริงตาม
// Layout Definition เดียวกันเป๊ะแบบ Reactive อยู่แล้ว) เพื่อให้ Interaction การลาก/Resize
// อยู่บน Grid ที่มีขนาด/พิกัดคงที่แน่นอน ไม่ต้องคำนวณอิงตำแหน่งจริงบนกระดาษที่เปลี่ยนตาม
// Zoom/Content — ลดความเสี่ยง Bug จาก Coordinate Mapping ที่ซับซ้อนเกินจำเป็น ยังคง
// "Drag ด้วยเมาส์" และ "Resize ด้วย Drag Handle" ตรงตาม Requirement ทุกประการ แค่อยู่ใน
// พื้นที่ควบคุมที่ปลอดภัยกว่า Canvas จริงที่ต้องรองรับทั้ง A4/9×11/5 ประเภทเอกสาร
export function HeaderZoneEditor({
  layout,
  onChange,
}: {
  layout: HeaderLayoutConfig;
  onChange: (next: HeaderLayoutConfig) => void;
}) {
  const [selected, setSelected] = useState<HeaderElementKey | null>(null);
  const [dragKey, setDragKey] = useState<HeaderElementKey | null>(null);

  function updateElement(key: HeaderElementKey, patch: Partial<HeaderLayoutConfig[HeaderElementKey]>) {
    onChange({ ...layout, [key]: { ...layout[key], ...patch } } as HeaderLayoutConfig);
  }

  function handleDrop(targetKey: HeaderElementKey) {
    if (!dragKey || dragKey === targetKey) return;
    const dragCell = layout[dragKey].cell;
    const targetCell = layout[targetKey].cell;
    onChange({
      ...layout,
      [dragKey]: { ...layout[dragKey], cell: targetCell },
      [targetKey]: { ...layout[targetKey], cell: dragCell },
    } as HeaderLayoutConfig);
    setDragKey(null);
  }

  const cellToKey = new Map<number, HeaderElementKey>();
  HEADER_ELEMENT_KEYS.forEach((k) => cellToKey.set(layout[k].cell, k));

  return (
    <div className="space-y-3">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${HEADER_GRID_COLS}, 1fr)` }}>
        {Array.from({ length: 6 }, (_, cell) => {
          const key = cellToKey.get(cell);
          if (!key) return <div key={cell} className="border border-dashed rounded h-14" />;
          const style = layout[key];
          const isSelected = selected === key;
          return (
            <div
              key={cell}
              draggable
              onDragStart={() => setDragKey(key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(key)}
              onDragEnd={() => setDragKey(null)}
              onClick={() => setSelected(key)}
              className={`h-14 border rounded px-2 py-1 text-xs cursor-move flex flex-col justify-center select-none ${
                isSelected ? "border-blue-500 bg-blue-50" : "bg-white hover:border-blue-300"
              } ${!style.visible ? "opacity-40" : ""} ${dragKey === key ? "border-blue-500 bg-blue-50" : ""}`}
            >
              <span className="font-medium truncate">{HEADER_ELEMENT_LABELS[key]}</span>
              <span className="text-gray-400">{HEADER_ALIGN_LABELS[style.align]}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400">ลากกล่องเพื่อสลับตำแหน่ง — คลิกเพื่อเลือกและแก้ไข Properties ด้านล่าง</p>

      {selected && (
        <ElementPropertiesPanel
          elementKey={selected}
          layout={layout}
          onUpdate={(patch) => updateElement(selected, patch)}
        />
      )}
    </div>
  );
}

function ElementPropertiesPanel({
  elementKey,
  layout,
  onUpdate,
}: {
  elementKey: HeaderElementKey;
  layout: HeaderLayoutConfig;
  onUpdate: (patch: Partial<HeaderLayoutConfig[HeaderElementKey]>) => void;
}) {
  const style = layout[elementKey];
  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-600">{HEADER_ELEMENT_LABELS[elementKey]}</h4>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={style.visible} onChange={(e) => onUpdate({ visible: e.target.checked })} />
          แสดง
        </label>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">การจัดวาง (Alignment)</label>
        <div className="flex gap-1">
          {HEADER_ALIGN_OPTIONS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onUpdate({ align: a as HeaderAlignKey })}
              className={`flex-1 text-xs py-1 rounded border ${
                style.align === a ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:border-blue-300"
              }`}
            >
              {HEADER_ALIGN_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      {elementKey === "logo" ? (
        <LogoSizeControl heightPx={(style as any).heightPx} onChange={(heightPx) => onUpdate({ heightPx } as any)} />
      ) : (
        <>
          <RangeControl
            label="ขนาดตัวอักษร (px)"
            value={(style as any).fontSizePx}
            min={HEADER_FONT_SIZE_BOUNDS[elementKey].min}
            max={HEADER_FONT_SIZE_BOUNDS[elementKey].max}
            step={1}
            onChange={(v) => onUpdate({ fontSizePx: v } as any)}
          />
          <RangeControl
            label="ระยะห่างบรรทัด (Line Height)"
            value={style.lineHeight}
            min={LINE_HEIGHT_MIN}
            max={LINE_HEIGHT_MAX}
            step={0.1}
            onChange={(v) => onUpdate({ lineHeight: v })}
          />
          <RangeControl
            label="ความกว้างสูงสุด (% ของช่อง)"
            value={style.maxWidthPct}
            min={MAX_WIDTH_PCT_MIN}
            max={MAX_WIDTH_PCT_MAX}
            step={5}
            onChange={(v) => onUpdate({ maxWidthPct: v })}
          />
        </>
      )}
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
        <span>{label}</span>
        <span className="text-gray-400">{value}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

// R6 Phase E.1 — "Resize Logo ด้วย Drag Handle" ตรงตาม Requirement — ใช้ Pointer Events
// ธรรมดา (mousedown/mousemove/mouseup ผ่าน Pointer Event API) ไม่ใช่ HTML5 Drag-and-Drop
// API เพราะเป็นคนละ Interaction กัน (Resize ลากต่อเนื่องตามตำแหน่งเมาส์ ต่างจาก Drag
// กล่องไปวางที่ Cell ปลายทางแบบ Drop) — ลากขึ้น/ลงปรับความสูงโลโก้ภายใน Safe Bounds
// (LOGO_HEIGHT_MIN_PX..MAX_PX) เสมอ ป้องกันไม่ให้โลโก้ใหญ่จนดันพื้นที่พิมพ์ล้น
function LogoSizeControl({ heightPx, onChange }: { heightPx: number; onChange: (px: number) => void }) {
  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = heightPx;
    function onMove(ev: PointerEvent) {
      const delta = startY - ev.clientY; // ลากขึ้น = ใหญ่ขึ้น (สัญชาตญาณเดียวกับ Resize Handle ทั่วไป)
      const next = Math.min(LOGO_HEIGHT_MAX_PX, Math.max(LOGO_HEIGHT_MIN_PX, Math.round(startHeight + delta)));
      onChange(next);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div>
      <label className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
        <span>ขนาดโลโก้ (สูง px)</span>
        <span className="text-gray-400">{heightPx}px</span>
      </label>
      <div className="flex items-center gap-3">
        <div
          className="relative bg-white border rounded flex items-center justify-center"
          style={{ width: 80, height: LOGO_HEIGHT_MAX_PX + 16 }}
        >
          <div className="bg-blue-100 border border-blue-300 rounded" style={{ width: heightPx * 0.9, height: heightPx }} />
          <div
            onPointerDown={handlePointerDown}
            className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-blue-600 rounded-sm cursor-ns-resize"
            title="ลากเพื่อปรับขนาดโลโก้"
          />
        </div>
        <input
          type="range"
          min={LOGO_HEIGHT_MIN_PX}
          max={LOGO_HEIGHT_MAX_PX}
          step={1}
          value={heightPx}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
    </div>
  );
}
