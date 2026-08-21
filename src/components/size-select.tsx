"use client";

import { useState } from "react";

// Phase R1 — Size Dropdown มาตรฐาน: ค่าที่บันทึกจริงยังเป็น Product.size: String? เดิม
// ทุกประการ (ไม่มี Migration) — ใช้ Pattern "Preset Picker ควบคุม Text Input เดียวที่
// เป็นตัวส่ง name=size จริง" เพื่อให้ Custom/Preset ใช้ Input เดียวกันเสมอ ไม่มีปัญหา
// name ชนกันตอน Submit — Preset ที่เลือกไว้ยังแก้ค่าต่อในช่อง Text ได้อิสระ
const STANDARD_SIZES = ["3 ฟุต", "3.5 ฟุต", "4 ฟุต", "5 ฟุต", "6 ฟุต"];
const CUSTOM_VALUE = "__custom__";
const NONE_VALUE = "__none__";

function presetFor(value: string): string {
  if (value === "") return NONE_VALUE;
  if (STANDARD_SIZES.includes(value)) return value;
  return CUSTOM_VALUE;
}

export function SizeSelect({ defaultValue = "" }: { defaultValue?: string }) {
  const [preset, setPreset] = useState(() => presetFor(defaultValue));
  const [text, setText] = useState(defaultValue);

  function handlePresetChange(value: string) {
    setPreset(value);
    if (value === CUSTOM_VALUE) {
      setText("");
    } else if (value === NONE_VALUE) {
      setText("");
    } else {
      setText(value);
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">ไซส์</label>
      <div className="flex gap-2">
        <select
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value={NONE_VALUE}>ไม่มีขนาด</option>
          {STANDARD_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={CUSTOM_VALUE}>ขนาดพิเศษ / ระบุเอง</option>
        </select>
        {preset === CUSTOM_VALUE && (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ระบุขนาด"
            autoFocus
            className="flex-1 border rounded px-3 py-1.5 text-sm"
          />
        )}
      </div>
      <input type="hidden" name="size" value={text} />
    </div>
  );
}
