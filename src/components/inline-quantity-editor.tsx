"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// Owner UAT (2026-09-02) — แก้จำนวนใน Line เดิมของตารางรายการ (หน้า Draft) ได้ตรงๆ โดยไม่
// ต้องลบแล้วเพิ่มใหม่ — Pattern เดียวกับ ActionButton (ActionResult + Toast + Transition +
// Unexpected Error โยนต่อไป error.tsx Boundary) ต่างแค่มี 2 สถานะ: แสดงผลปกติ (ตัวเลข +
// ปุ่มแก้ไข) ↔ กำลังแก้ (ช่องกรอก + บันทึก/ยกเลิก, Enter=บันทึก Esc=ยกเลิก) — Server Action
// ที่รับมา (updateOrderItemQuantity/updateQuotationItemQuantity) เป็นคนคุม Permission/
// Status Lock ทั้งหมดเหมือน Add/Remove เดิม Component นี้ไม่มี Business Logic เลย
export function InlineQuantityEditor({
  value,
  action,
}: {
  value: number;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value));
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);

  if (thrownError) throw thrownError;

  function startEdit() {
    setInput(String(value));
    setEditing(true);
  }

  function save() {
    const quantity = Number(input);
    if (!(quantity > 0)) {
      showError("จำนวนต้องมากกว่า 0");
      return;
    }
    if (quantity === value) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("quantity", input);
        const result = await action(formData);
        if (result.success) {
          showSuccess("แก้ไขจำนวนสำเร็จ");
          setEditing(false);
        } else {
          showError(result.error);
        }
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5 justify-end">
        <span>{value}</span>
        <button
          type="button"
          onClick={startEdit}
          title="แก้ไขจำนวน"
          className="text-xs text-gray-400 hover:text-blue-600"
        >
          แก้ไข
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 justify-end">
      <input
        type="number"
        step="1"
        min="1"
        value={input}
        autoFocus
        disabled={isPending}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        className="w-16 border rounded px-1.5 py-0.5 text-right text-sm disabled:bg-gray-100"
      />
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded px-1.5 py-0.5"
      >
        {isPending ? "..." : "บันทึก"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={isPending}
        className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
      >
        ยกเลิก
      </button>
    </span>
  );
}
