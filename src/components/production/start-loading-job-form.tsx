"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// CP6 — ปุ่มยืนยันเริ่มขึ้นของ (ใช้ทั้งงานจากใบผลิตและงานสต็อก): ถามชัดๆ ก่อนลงมือ +
// เลือกว่าเริ่มรอบจัดส่งใหม่ หรือเพิ่มเข้ารอบเดิมที่ยังเปิดอยู่ (ขึ้นรถคันเดียวกันหลายงาน)
// สำเร็จแล้วพาเข้าหน้าเตรียมขึ้นของของรอบนั้นทันที
export function StartLoadingJobForm({
  confirmQuestion,
  confirmNote,
  submitLabel,
  openRuns,
  action,
}: {
  confirmQuestion: string;
  confirmNote?: string;
  submitLabel: string;
  openRuns: { id: string; label: string }[];
  action: (formData: FormData) => Promise<ActionResult & { tripId?: string }>;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [tripId, setTripId] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

  function handleSubmit() {
    if (isPending) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("mode", mode);
        if (mode === "existing") formData.set("tripId", tripId);
        const result = await action(formData);
        if (!result.success) {
          showError(result.error);
          router.refresh();
          return;
        }
        router.push(`/production/loading/${result.tripId}`);
      } catch (error) {
        unstable_rethrow(error);
        showError("บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold">{confirmQuestion}</p>
      {confirmNote && <p className="text-xs text-gray-500">{confirmNote}</p>}

      {openRuns.length > 0 && (
        <div className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="run-mode" checked={mode === "new"} onChange={() => setMode("new")} />
            เริ่มรอบจัดส่งใหม่
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="run-mode" checked={mode === "existing"} onChange={() => setMode("existing")} />
            เพิ่มเข้ารอบจัดส่งเดิมที่ยังเปิดอยู่
          </label>
          {mode === "existing" && (
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">— เลือกรอบจัดส่ง —</option>
              {openRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={isPending || (mode === "existing" && !tripId)}
        onClick={handleSubmit}
        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2.5"
      >
        {isPending ? "กำลังบันทึก..." : submitLabel}
      </button>
    </div>
  );
}
