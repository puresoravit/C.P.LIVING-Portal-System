"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// S4 UAT (2026-08-29) — ปุ่มพิมพ์ของใบสั่งผลิต แยกจาก PrintButton ของ Billing เพราะ
// semantics ต่างกัน: ครั้งแรกต้องเป็น explicit "ยืนยันเริ่มผลิตและพิมพ์" (เปลี่ยน status +
// บันทึกผู้กด/เวลา ฝั่ง server ก่อน แล้วค่อยเปิด print dialog) — หลังจากนั้นเป็น "พิมพ์ซ้ำ"
// ล้วนๆ ไม่แตะ state ใดๆ ทั้งสิ้น
//
// ตั้งใจไม่ใช้ afterprint event ในการเปลี่ยน state เด็ดขาด (บทเรียนจริงของ Billing:
// afterprint ยิงเหมือนกันทั้งกด Print และกด Cancel ใน dialog) — state เปลี่ยนจากปุ่ม
// explicit ของมนุษย์เท่านั้น และเปลี่ยน "ก่อน" เปิด dialog ตาม flow ที่ Owner อนุมัติ
// (เอกสารถือว่าเริ่มผลิตเมื่อคนยืนยันจะพิมพ์เพื่อเริ่มงานจริง ไม่ใช่เมื่อกระดาษออก)
export function ProductionPrintControls({
  started,
  startedLabel,
  inProgressStatus,
  backHref,
  startAction,
}: {
  /** true = เคยกดยืนยันเริ่มผลิตไปแล้ว (ปุ่มกลายเป็น "พิมพ์ซ้ำ" ที่ไม่แตะ state) */
  started: boolean;
  startedLabel?: string;
  inProgressStatus: string;
  backHref: string;
  startAction: () => Promise<ActionResult>;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { showError } = useToast();

  function handleConfirmStart() {
    startTransition(async () => {
      try {
        const result = await startAction();
        if (!result.success) {
          showError(result.error);
          return;
        }
        setShowConfirm(false);
        window.print();
      } catch (error) {
        unstable_rethrow(error);
        showError("เริ่มผลิตไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  return (
    <>
      <div className="print:hidden flex flex-wrap items-center gap-2 mb-4 sticky top-0 bg-gray-50 py-2 z-10">
        {started ? (
          <>
            <button
              onClick={() => window.print()}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
            >
              พิมพ์ซ้ำ / บันทึกเป็น PDF
            </button>
            <span className="text-sm text-green-700 border border-green-200 bg-green-50 rounded px-3 py-2 whitespace-nowrap">
              ✓ เริ่มผลิตแล้ว{startedLabel ? ` — ${startedLabel}` : ""}
            </span>
          </>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
          >
            ยืนยันเริ่มผลิตและพิมพ์
          </button>
        )}
        <a href={backHref} className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap">
          ← กลับ
        </a>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h2 className="font-semibold text-base mb-2">ยืนยันเริ่มผลิตใบนี้?</h2>
            <p className="text-sm text-gray-500 mb-4">
              สถานะจะเปลี่ยนเป็น &quot;{inProgressStatus}&quot; พร้อมบันทึกผู้ยืนยันและเวลา จากนั้นเปิดหน้าต่างพิมพ์ —
              การพิมพ์ซ้ำครั้งถัดไปจะไม่เปลี่ยนสถานะอีก
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="text-sm border rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmStart}
                disabled={isPending}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
              >
                {isPending ? "กำลังบันทึก..." : "ยืนยันและพิมพ์"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
