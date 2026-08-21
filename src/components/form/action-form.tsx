"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { FieldErrorsContext, useFieldErrorsContext } from "./field-errors-context";

// Phase R2.0 — ActionForm: เรียก Server Action ตรงๆ (ไม่ผ่าน <form action=...> แบบ
// Native) เพื่อคุม Error ทั้งสองแบบแยกกันชัดเจน:
//
// 1. Expected error (Validation/Business Rule) — Action คืน { success:false, error,
//    fieldErrors? } กลับมาโดยไม่ throw → หน้าไม่เปลี่ยน, ค่าที่กรอกไว้ไม่หาย (เพราะไม่มี
//    Navigation/Remount เกิดขึ้นเลย), Toast แดงขึ้นเสมอ, ถ้ามี fieldErrors จะ Highlight
//    ทุก Field ที่ผิดพร้อมกันผ่าน FieldErrorsContext + Focus ไปที่ Field แรกที่ผิด
//
// 2. Unexpected error (Bug/DB down) — Action throw จริง → ตรงนี้ catch แล้วเก็บลง
//    state แล้ว throw ซ้ำระหว่าง Render (บรรทัด `if (thrownError) throw thrownError`)
//    เพื่อ "เด้ง" Error ไปให้ nearest error.tsx Boundary จับต่อ ตามพฤติกรรมเดิมของระบบ
//    ทุกประการ (error.tsx เรียก logClientError ให้เองอยู่แล้ว) — ไม่มีการ swallow
//    Unexpected Error เงียบๆ
export function ActionForm({
  action,
  successMessage = "บันทึกสำเร็จ",
  resetOnSuccess = false,
  onSuccess,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [thrownError, setThrownError] = useState<unknown>(null);
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();

  if (thrownError) throw thrownError;

  function clearFieldError(name: string) {
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return; // กัน double-submit ระหว่างรอผลลัพธ์เดิม
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result.success) {
          setFieldErrors({});
          showSuccess(successMessage);
          if (resetOnSuccess) formRef.current?.reset();
          onSuccess?.();
        } else {
          setFieldErrors(result.fieldErrors ?? {});
          showError(result.error);
        }
      } catch (err) {
        setThrownError(err);
      }
    });
  }

  // Focus ไปยัง Field แรกที่ error หลัง Submit ไม่ผ่าน (ตามลำดับ Field ใน DOM จริง
  // ไม่ใช่ลำดับ key ใน object ซึ่งไม่รับประกันตรงกับลำดับที่แสดงบนจอ)
  useEffect(() => {
    const keys = Object.keys(fieldErrors);
    if (keys.length === 0 || !formRef.current) return;
    const firstInvalid = formRef.current.querySelector<HTMLElement>(
      keys.map((k) => `[name="${k}"]`).join(",")
    );
    firstInvalid?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldErrors]);

  return (
    <FieldErrorsContext.Provider value={{ fieldErrors, clearFieldError, isPending }}>
      <form ref={formRef} onSubmit={handleSubmit} className={className} noValidate={false}>
        {children}
      </form>
    </FieldErrorsContext.Provider>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "กำลังบันทึก...",
  className = "bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { isPending } = useFieldErrorsContext();
  return (
    <button type="submit" disabled={isPending} className={`${className} disabled:opacity-50`}>
      {isPending ? pendingLabel : children}
    </button>
  );
}
