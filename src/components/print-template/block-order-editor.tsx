"use client";

import { useState } from "react";
import { PRINT_BLOCK_LABELS, DEFAULT_BLOCK_ORDER, type PrintBlockKey } from "@/lib/print-template-settings";

// R6 Phase E — Visual Designer: Drag & Drop จัดลำดับเฉพาะ 3 Block ที่ปลอดภัย (ดูเหตุผล
// เต็มใน print-template-settings.ts) — ใช้ Native HTML5 Drag and Drop API ล้วนๆ (ไม่มี
// Library ใหม่ในระบบนี้มาก่อน) แสดง Item Table+Summary และ Signature+Footer เป็น
// รายการ "ตรึงตำแหน่ง" (Lock icon, Drag ไม่ได้) ต่อท้ายให้เห็นโครงเอกสารครบ กันสับสนว่า
// ทำไมลาก 2 บล็อกนี้ไม่ได้
export function BlockOrderEditor({
  order,
  onChange,
  disabled,
}: {
  order: PrintBlockKey[];
  onChange: (next: PrintBlockKey[]) => void;
  disabled?: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...order];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
    setDragIndex(null);
  }

  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {order.map((key, i) => (
          <li
            key={key}
            draggable={!disabled}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
            onDragEnd={() => setDragIndex(null)}
            className={`flex items-center gap-2 border rounded px-2 py-1.5 text-sm bg-white select-none ${
              disabled ? "opacity-50" : "cursor-move hover:border-blue-400"
            } ${dragIndex === i ? "border-blue-500 bg-blue-50" : ""}`}
          >
            <span className="text-gray-400" aria-hidden>
              ⠿
            </span>
            <span className="flex-1">{PRINT_BLOCK_LABELS[key]}</span>
          </li>
        ))}
      </ul>
      <div className="border rounded px-2 py-1.5 text-xs bg-gray-50 text-gray-500 flex items-center gap-2">
        <span aria-hidden>🔒</span>
        <span>ตารางรายการ + สรุปยอด (ตำแหน่งตรึงถาวร — กันเนื้อหาล้น/ทับหน้าเวลารายการยาว)</span>
      </div>
      <div className="border rounded px-2 py-1.5 text-xs bg-gray-50 text-gray-500 flex items-center gap-2">
        <span aria-hidden>🔒</span>
        <span>ลายเซ็น + ท้ายเอกสาร (ตำแหน่งตรึงถาวร — ชิดขอบล่างเสมอ)</span>
      </div>
      {!disabled && (
        <button type="button" onClick={() => onChange(DEFAULT_BLOCK_ORDER)} className="text-xs text-blue-600 hover:underline">
          รีเซ็ตลำดับ Block
        </button>
      )}
    </div>
  );
}
