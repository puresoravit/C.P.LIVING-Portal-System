"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { BackLink } from "@/components/production/back-link";

// CP6 — ปุ่มพิมพ์ใบขึ้นของ ตาม pattern S4 (production-print-controls): เปิด print dialog ก่อน
// เสมอ แล้วใช้ afterprint แค่ "เปิด modal ถามมนุษย์" (browser แยกกด Print/Cancel ไม่ได้ —
// บทเรียน Billing) — ยืนยันแล้ว server บันทึก ผู้พิมพ์/เวลา/เวอร์ชันแผน เท่านั้น
// การพิมพ์ ≠ ขึ้นของ/ส่งออก — ไม่แตะ quantity/loaded/reconcile ใดๆ (fact แยกโดยสิ้นเชิง)
export function LoadingSheetControls({
  backHref,
  canConfirm,
  alreadyPrinted,
  printedLabel,
  planChangedAfterPrint,
  confirmAction,
}: {
  backHref: string;
  /** มีสิทธิ์ + รอบยัง active (ไม่ยกเลิก/ยังไม่ส่งออก) — false = พิมพ์ดูอย่างเดียว */
  canConfirm: boolean;
  alreadyPrinted: boolean;
  printedLabel?: string;
  /** แผนถูกแก้หลังพิมพ์ครั้งล่าสุด — พิมพ์ใหม่แล้วให้ยืนยันซ้ำเพื่ออัปเดตเวอร์ชันที่พิมพ์ */
  planChangedAfterPrint: boolean;
  confirmAction: () => Promise<ActionResult>;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { showError } = useToast();

  const needsConfirm = canConfirm && (!alreadyPrinted || planChangedAfterPrint);

  function handlePrintClick() {
    if (!needsConfirm) {
      window.print();
      return;
    }
    const onAfterPrint = () => {
      window.removeEventListener("afterprint", onAfterPrint);
      setShowConfirm(true);
    };
    window.addEventListener("afterprint", onAfterPrint);
    window.print();
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await confirmAction();
        if (!result.success) {
          showError(result.error);
          return;
        }
        setShowConfirm(false);
      } catch (error) {
        unstable_rethrow(error);
        showError("บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  return (
    <>
      {planChangedAfterPrint && (
        <div className="print:hidden bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded px-3 py-2 mb-2">
          ⚠ แผนถูกแก้หลังพิมพ์ครั้งล่าสุด — ใบที่พิมพ์ไว้อาจไม่ตรงแผนล่าสุด แนะนำพิมพ์ใหม่ก่อนขึ้นของ
        </div>
      )}
      <div className="print:hidden flex flex-wrap items-center gap-2 mb-3 sticky top-0 bg-gray-50 py-2 z-10">
        <button
          onClick={handlePrintClick}
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
        >
          {alreadyPrinted && !planChangedAfterPrint ? "พิมพ์ซ้ำ / บันทึกเป็น PDF" : "พิมพ์ใบขึ้นของ (A4 แนวตั้ง)"}
        </button>
        {alreadyPrinted && (
          <span className="text-sm text-green-700 border border-green-200 bg-green-50 rounded px-3 py-2 whitespace-nowrap">
            ✓ พิมพ์แล้ว{printedLabel ? ` — ${printedLabel}` : ""}
          </span>
        )}
        <span className="text-xs text-gray-500">การพิมพ์ไม่ใช่การส่งออก — บันทึกผลขึ้นของได้ที่หน้ารอบจัดส่งหลังนับยอดจริง</span>
        <BackLink fallbackHref={backHref} label="← ย้อนกลับ" className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap" />
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h2 className="font-semibold text-base mb-2">ยืนยันว่าพิมพ์ใบขึ้นของแล้วหรือไม่?</h2>
            <p className="text-sm text-gray-500 mb-4">
              ยืนยันเพื่อบันทึกผู้พิมพ์/เวลา และเปลี่ยนสถานะรอบเป็น &quot;พิมพ์ใบขึ้นของแล้ว · รอบันทึกผลขึ้นของ&quot; —
              การพิมพ์ไม่ใช่การยืนยันว่าขึ้นของ/ส่งออกแล้ว ยอดทั้งหมดยังแก้ได้จนถึงขั้นบันทึกผล
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="text-sm border rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              >
                ยังไม่ได้พิมพ์
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
              >
                {isPending ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
