"use client";

import { useTransition } from "react";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// Phase E1 — เรียก Server Action ตรงๆ จาก client (ไม่ผ่าน <form action>) แล้วอ่านค่า
// { success, error } ที่ Action คืนกลับมา แสดงเป็น Toast — action ต้องคืนค่าแบบนี้
// (ไม่ throw) สำหรับ Validation Error ที่คาดไว้แล้ว เพื่อเลี่ยงปัญหา Next.js production
// redact ข้อความของ Error ที่ throw ออกจาก Server Action/Component (ดู
// src/lib/action-result.ts สำหรับ root cause เต็มๆ)
export function CancelButton({
  action,
  confirmMessage,
  label = "ยกเลิกเอกสาร",
  successMessage = "ยกเลิกเอกสารสำเร็จ",
  className = "text-sm text-gray-600 hover:text-red-600 border rounded px-4 py-2",
}: {
  action: () => Promise<ActionResult>;
  confirmMessage?: string;
  label?: string;
  successMessage?: string;
  className?: string;
}) {
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        showSuccess(result.message ?? successMessage);
      } else {
        showError(result.error);
      }
    });
  }

  return (
    <button onClick={handleClick} disabled={isPending} className={`${className} disabled:opacity-50`}>
      {isPending ? "กำลังยกเลิก..." : label}
    </button>
  );
}
