"use client";

import { useState } from "react";
import {
  HEADER_ELEMENT_LABELS,
  HEADER_ALIGN_OPTIONS,
  HEADER_ALIGN_LABELS,
  HEADER_FONT_SIZE_BOUNDS,
  HEADER_FONT_WEIGHT_OPTIONS,
  HEADER_FONT_WEIGHT_LABELS,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  COL_SPAN_MIN,
  COL_SPAN_MAX,
  FONT_FAMILY_OPTIONS,
  FONT_FAMILY_LABELS,
  type HeaderElementKey,
  type HeaderElementStyle,
  type HeaderLogoStyle,
  type HeaderAlignKey,
  type FontFamilyKey,
  type HeaderFontWeightKey,
} from "@/lib/print-template-settings";

// R6 Phase E.2 — Properties Panel แบบ Compact/Collapsible: แสดงเฉพาะ Element ที่เลือกอยู่
// เท่านั้น (ไม่ใช่ Section ยาวเรียงกันทั้งหมดแบบ E.1) ลดการ Scroll ตาม Requirement —
// คลิก Element บน Canvas → เลือก → แสดงแถบนี้ทันที คลิกที่ว่างบน Canvas → ปิด
export function HeaderElementPropertiesBar({
  elementKey,
  style,
  onUpdate,
}: {
  elementKey: HeaderElementKey;
  style: HeaderElementStyle | HeaderLogoStyle;
  onUpdate: (patch: Partial<HeaderElementStyle>) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isLogo = elementKey === "logo";
  const bounds = isLogo ? null : HEADER_FONT_SIZE_BOUNDS[elementKey as Exclude<HeaderElementKey, "logo">];

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700"
      >
        <span>{HEADER_ELEMENT_LABELS[elementKey]}</span>
        <span className="text-gray-400">{collapsed ? "▸ ขยาย" : "▾ ย่อ"}</span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={style.visible} onChange={(e) => onUpdate({ visible: e.target.checked })} />
            แสดง
          </label>

          <div>
            <div className="text-xs text-gray-500 mb-1">การจัดวาง</div>
            <div className="flex gap-1">
              {HEADER_ALIGN_OPTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => onUpdate({ align: a as HeaderAlignKey })}
                  className={`text-xs px-2 py-1 rounded border ${
                    style.align === a ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:border-blue-300"
                  }`}
                >
                  {HEADER_ALIGN_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          <CompactRange
            label="ความกว้าง"
            value={style.colSpan}
            min={COL_SPAN_MIN}
            max={COL_SPAN_MAX}
            step={1}
            unit="%"
            onChange={(v) => onUpdate({ colSpan: v })}
          />

          {!isLogo && bounds && (
            <>
              <CompactRange
                label="ขนาดตัวอักษร"
                value={(style as HeaderElementStyle).fontSizePx}
                min={bounds.min}
                max={bounds.max}
                step={1}
                unit="px"
                onChange={(v) => onUpdate({ fontSizePx: v })}
              />
              <CompactRange
                label="ระยะห่างบรรทัด"
                value={(style as HeaderElementStyle).lineHeight}
                min={LINE_HEIGHT_MIN}
                max={LINE_HEIGHT_MAX}
                step={0.1}
                unit=""
                onChange={(v) => onUpdate({ lineHeight: v })}
              />
              <div>
                <div className="text-xs text-gray-500 mb-1">น้ำหนักตัวอักษร</div>
                <div className="flex gap-1">
                  {HEADER_FONT_WEIGHT_OPTIONS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onUpdate({ fontWeight: w as HeaderFontWeightKey })}
                      className={`text-xs px-2 py-1 rounded border ${
                        (style as HeaderElementStyle).fontWeight === w
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white hover:border-blue-300"
                      }`}
                    >
                      {HEADER_FONT_WEIGHT_LABELS[w]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-w-[140px]">
                <div className="text-xs text-gray-500 mb-1">แบบตัวอักษร</div>
                <select
                  value={(style as HeaderElementStyle).fontFamily ?? ""}
                  onChange={(e) => onUpdate({ fontFamily: (e.target.value || undefined) as FontFamilyKey | undefined })}
                  className="w-full border rounded px-2 py-1 text-xs"
                >
                  <option value="">ค่าเริ่มต้น (ตามส่วนกลาง)</option>
                  {FONT_FAMILY_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {FONT_FAMILY_LABELS[f]}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <p className="text-xs text-gray-400 w-full">ลากตัว Element บน Canvas เพื่อย้ายตำแหน่ง — ลากขอบเพื่อปรับขนาด</p>
        </div>
      )}
    </div>
  );
}

function CompactRange({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="min-w-[140px]">
      <div className="text-xs text-gray-500 mb-1 flex justify-between">
        <span>{label}</span>
        <span>
          {value}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}
