"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

// ข้อ E2 — Shared Notification System ใช้ร่วมกันทั้งระบบ ไม่ให้แต่ละหน้าสร้าง Toast
// คนละแบบ: สีเขียว = สำเร็จ, สีแดง = ผิดพลาด, สีเหลือง/ส้ม = คำเตือน หายไปเองหลัง
// ระยะเวลาที่เหมาะสม ไม่ใช้แทน field-level validation ที่จำเป็น (แค่ feedback เสริม)
type ToastKind = "success" | "error" | "warning";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 4500;

const STYLES: Record<ToastKind, string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  warning: "bg-amber-500",
};

const ICONS: Record<ToastKind, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    showSuccess: (m) => push("success", m),
    showError: (m) => push("error", m),
    showWarning: (m) => push("warning", m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 print:hidden pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg shadow-lg px-4 py-3 text-sm text-white max-w-sm flex items-start gap-2 ${STYLES[t.kind]}`}
          >
            <span className="font-bold">{ICONS[t.kind]}</span>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-white/80 hover:text-white leading-none">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast ต้องถูกเรียกภายใน ToastProvider เท่านั้น");
  return ctx;
}
