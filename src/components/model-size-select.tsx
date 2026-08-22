"use client";

import { useEffect, useState } from "react";
import { resolveModelSize, type ModelResult, type PickedProduct, type UnresolvedSizeInfo } from "./product-search-picker";

export type ModelSizeResolution = { picked: PickedProduct } | { unresolved: UnresolvedSizeInfo } | null;

// Owner UAT Round 3 — ข้อ 4: Control "ขนาด" ที่ Parent เรนเดอร์เองแทน Picker (ดู
// product-search-picker.tsx) — ใช้ร่วมกันทุกจุดที่มีช่อง "ขนาด" อยู่แล้ว (Order/
// Quotation/Tax Invoice/Repair Note) แสดงเป็น <select> จาก model.sizes จริง แทนที่ช่อง
// ขนาดแบบ Free-text ชั่วคราว ตอนเลือก Model ที่มีมากกว่า 1 ขนาด — Reset ตัวเองอัตโนมัติ
// ทุกครั้งที่ model เปลี่ยน (เลือก Model ใหม่/ล้าง)
export function ModelSizeSelect({
  model,
  onResolve,
  className = "w-full border rounded px-2 py-1.5 text-sm",
}: {
  model: ModelResult;
  onResolve: (result: ModelSizeResolution) => void;
  className?: string;
}) {
  const [idx, setIdx] = useState("");

  useEffect(() => {
    setIdx("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.modelId]);

  return (
    <select
      value={idx}
      onChange={(e) => {
        setIdx(e.target.value);
        onResolve(e.target.value === "" ? null : resolveModelSize(model, Number(e.target.value)));
      }}
      className={className}
    >
      <option value="" disabled>
        — ขนาด —
      </option>
      {model.sizes.map((s, i) => (
        <option key={i} value={i}>
          {s.label}
          {!s.resolved && !s.custom ? " (ยังไม่มีในระบบ)" : ""}
        </option>
      ))}
    </select>
  );
}
