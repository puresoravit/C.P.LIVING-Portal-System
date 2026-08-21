"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ข้อ E2 — Shared Notification System ใช้ร่วมกันทั้งระบบ ไม่ให้แต่ละหน้าสร้าง Toast
// คนละแบบ: สีเขียว = สำเร็จ, สีแดง = ผิดพลาด, สีเหลือง/ส้ม = คำเตือน หายไปเองหลัง
// ระยะเวลาที่เหมาะสม ไม่ใช้แทน field-level validation ที่จำเป็น (แค่ feedback เสริม)
//
// ตำแหน่ง/Animation (รอบปรับ UX): บนสุดกึ่งกลางจอ, Fade+Slide ลงเบาๆ ตอนแสดง, Fade Out
// ตอนหาย — ระยะเวลาแตกต่างกันตามประเภท (Error อยู่นานกว่า Success เพราะข้อความมักยาว/
// สำคัญกว่า) ปุ่ม × ให้ปิดเองได้เสมอสำหรับข้อความที่ยาวเป็นพิเศษ — Business Logic ของ
// Error/Success เดิมไม่ถูกแตะ เปลี่ยนแค่ Presentation
type ToastKind = "success" | "error" | "warning";
type Toast = { id: number; kind: ToastKind; message: string; leaving: boolean };

type ToastContextValue = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS: Record<ToastKind, number> = {
  success: 2500,
  error: 4000,
  warning: 4000,
};
const EXIT_MS = 220;

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

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const visible = entered && !toast.leaving;

  return (
    <div
      role="status"
      className={`pointer-events-auto rounded-lg shadow-lg px-4 py-3 text-sm text-white max-w-md w-full sm:w-auto flex items-start gap-2 transition-all duration-[220ms] ease-out ${STYLES[toast.kind]} ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      <span className="font-bold">{ICONS[toast.kind]}</span>
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="text-white/80 hover:text-white leading-none">
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>[]>());

  const remove = useCallback((id: number) => {
    const pending = timers.current.get(id);
    if (pending) {
      pending.forEach(clearTimeout);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startLeave = useCallback(
    (id: number) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      const exitTimer = setTimeout(() => remove(id), EXIT_MS);
      timers.current.set(id, [...(timers.current.get(id) ?? []), exitTimer]);
    },
    [remove]
  );

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message, leaving: false }]);
      const autoTimer = setTimeout(() => startLeave(id), DURATION_MS[kind]);
      timers.current.set(id, [autoTimer]);
    },
    [startLeave]
  );

  const value: ToastContextValue = {
    showSuccess: (m) => push("success", m),
    showError: (m) => push("error", m),
    showWarning: (m) => push("warning", m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* top-[76px] บน Mobile กันทับ Sticky Top Bar ของ Sidebar (~63px) ที่เพิ่มมาใน
          Phase Nav-1 — Desktop ไม่มี Top Bar นี้ จึงใช้ top-4 ตามเดิม */}
      <div className="fixed top-[76px] md:top-4 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none print:hidden">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={startLeave} />
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
