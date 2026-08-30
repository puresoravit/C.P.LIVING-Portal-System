"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// CP0 (2026-08-30) — ปุ่มยกเลิกเอกสาร Production (ออเดอร์ลูกค้า/ใบสั่งผลิต) + modal ยืนยัน
// 2 ระดับตาม D5: ปกติ = ยืนยัน+เหตุผล / กระทบใบที่เริ่มผลิตแล้ว = โทนแดง คำเตือนแรง
// (ข้อความคำเตือนมาจาก server component ผู้เรียก — component นี้แค่ render)
// สิทธิ์จริง enforce ฝั่ง server เสมอ — `blockedMessage` เป็นแค่ UX บอกล่วงหน้าว่ากดไป
// ก็จะถูกปฏิเสธ (เช่น staff กับใบที่เริ่มผลิตแล้ว) ไม่ใช่ตัวกันจริง
export function CancelDocumentButton({
  buttonLabel,
  modalTitle,
  warningLines,
  danger,
  blockedMessage,
  version,
  action,
}: {
  buttonLabel: string;
  modalTitle: string;
  /** บรรทัดคำอธิบาย/คำเตือนใน modal (server ประกอบมาตามสถานการณ์จริง) */
  warningLines: string[];
  /** true = กระทบใบที่เริ่มผลิตแล้ว → โทนแดงเข้ม คำเตือนแรง */
  danger: boolean;
  /** มีค่า = ผู้ใช้ปัจจุบันไม่มีสิทธิ์ทำเคสนี้ — modal แสดงข้อความนี้อย่างเดียว ไม่มีฟอร์ม */
  blockedMessage?: string;
  /** optimistic lock ของ CustomerPO (ใบสั่งผลิตไม่ใช้ — ไม่ต้องส่ง) */
  version?: number;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

  function handleConfirm() {
    if (!reason.trim()) {
      setErr("กรุณากรอกเหตุผลที่ยกเลิก");
      return;
    }
    setErr("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("reason", reason.trim());
        if (version != null) formData.set("version", String(version));
        const result = await action(formData);
        if (!result.success) {
          showError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("ยกเลิกไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-block text-xs px-2 py-0.5 rounded-full border border-red-300 text-red-700 hover:bg-red-50"
      >
        {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className={`bg-white rounded-lg shadow-xl max-w-md w-full p-5 ${danger ? "border-2 border-red-400" : ""}`}>
            <h2 className={`font-semibold text-base mb-2 ${danger ? "text-red-700" : ""}`}>{modalTitle}</h2>

            {blockedMessage ? (
              <>
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{blockedMessage}</p>
                <div className="flex justify-end">
                  <button onClick={() => setOpen(false)} className="text-sm border rounded px-4 py-2 hover:bg-gray-50">
                    ปิด
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={`text-sm space-y-1.5 mb-3 ${danger ? "text-red-700" : "text-gray-600"}`}>
                  {warningLines.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
                <label className="block text-xs font-medium text-gray-600 mb-1">เหตุผลที่ยกเลิก *</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="เช่น ลูกค้าขอยกเลิก, ออกเอกสารผิด"
                  className="w-full border rounded px-3 py-2 text-sm mb-1"
                  autoFocus
                />
                {err && <p className="text-xs text-red-600 mb-1">{err}</p>}
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => setOpen(false)}
                    disabled={isPending}
                    className="text-sm border rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
                  >
                    ไม่ยกเลิก
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={isPending}
                    className={`text-white text-sm font-medium rounded px-4 py-2 disabled:opacity-50 ${danger ? "bg-red-700 hover:bg-red-800" : "bg-red-600 hover:bg-red-700"}`}
                  >
                    {isPending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
