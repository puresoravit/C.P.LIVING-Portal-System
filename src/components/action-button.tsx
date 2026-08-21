"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// Phase R2.4 — ปุ่มเรียก Server Action ทั่วไปที่คืนค่า ActionResult (ไม่มี Field
// ให้ Highlight เอง เช่น Confirm/ลบรายการ/คัดลอก) — เหมือน CancelButton (Phase E1)
// ทุกประการแต่ตั้งชื่อกลาง ไม่ผูกกับความหมาย "ยกเลิก" โดยเฉพาะ และเพิ่มการดัก
// Unexpected Error ให้ยังไปที่ error.tsx Boundary ตามเดิม (ของ CancelButton เดิม
// ไม่มี try/catch จุดนี้ แต่ที่นี่เพิ่มให้ครบตามที่ R2 กำหนด)
export function ActionButton({
  action,
  confirmMessage,
  label,
  pendingLabel = "กำลังบันทึก...",
  successMessage = "ดำเนินการสำเร็จ",
  className = "text-sm border rounded px-4 py-2",
  disabled = false,
}: {
  action: () => Promise<ActionResult>;
  confirmMessage?: string;
  label: string;
  pendingLabel?: string;
  successMessage?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);

  if (thrownError) throw thrownError;

  function handleClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    startTransition(async () => {
      try {
        const result = await action();
        if (result.success) {
          showSuccess(successMessage);
        } else {
          showError(result.error);
        }
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  return (
    <button onClick={handleClick} disabled={disabled || isPending} className={`${className} disabled:opacity-50`}>
      {isPending ? pendingLabel : label}
    </button>
  );
}
