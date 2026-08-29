"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { BackLink } from "@/components/production/back-link";

// S4 UAT round 3 (2026-08-29) — Owner กลับลำดับจากรอบ 2: ต้องเปิด browser print dialog
// (window.print()) ก่อนเสมอ แล้วค่อยถามยืนยันตอนกลับมาจากหน้าต่างพิมพ์ — เหตุผล: browser
// แยก "กด Print" กับ "กด Cancel" ไม่ได้แน่นอน (บทเรียนจริงของ print-button.tsx ฝั่ง
// Billing — afterprint ยิงเหมือนกันทั้งคู่) ดังนั้นใช้ afterprint แค่ "เปิด modal" เท่านั้น
// ไม่ใช้ตัดสินใจ mark state เอง — มนุษย์ต้องกดยืนยันเองเสมอ ("ยืนยัน" vs "ยังไม่ได้พิมพ์")
// พิมพ์ Rev ใหม่หลังเริ่มผลิตไปแล้วก็ใช้หลักเดียวกันทุกอย่าง — confirmAction (server)
// ตัดสินเองจาก CAS อิสระ 2 ชุดว่า mark เฉพาะ revision หรือต้อง mark เริ่มผลิตด้วย (actions.ts)
// ฝั่ง client เปลี่ยนแค่จังหวะเรียก ไม่แตะ logic ฝั่ง server
export function ProductionPrintControls({
  orderStarted,
  currentRevPrinted,
  startedLabel,
  revisionPrintedLabel,
  printCopies,
  inProgressStatus,
  backHref,
  confirmAction,
}: {
  /** true = ProductionOrder เคยเริ่มผลิตแล้ว (ทั้งใบ เปลี่ยนครั้งเดียวตลอดชีวิตของออเดอร์) */
  orderStarted: boolean;
  /** true = Revision ปัจจุบัน (currentRevNo) เคยถูกพิมพ์แล้ว */
  currentRevPrinted: boolean;
  startedLabel?: string;
  revisionPrintedLabel?: string;
  printCopies: number;
  inProgressStatus: string;
  backHref: string;
  confirmAction: () => Promise<ActionResult>;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { showError } = useToast();

  function handlePrintClick() {
    if (currentRevPrinted) {
      // พิมพ์ซ้ำล้วนๆ — ไม่มีอะไรต้องยืนยันเพิ่ม ไม่ต้องเปิด modal หลังพิมพ์
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
      {orderStarted && !currentRevPrinted && (
        <div className="print:hidden bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded px-3 py-2 mb-2">
          Revision นี้ยังไม่เคยพิมพ์ — จะพิมพ์แจกใหม่หรือไม่ก็ได้ (กฎล่าสุด: ไม่บังคับพิมพ์ใหม่หลังแก้) ถ้าพิมพ์แล้วให้กดยืนยันเพื่อบันทึกผู้พิมพ์/เวลา — ออเดอร์ยังคงสถานะ &quot;{inProgressStatus}&quot; เดิม ไม่ใช่การเริ่มผลิตใหม่
        </div>
      )}

      <div className="print:hidden flex flex-wrap items-center gap-2 mb-4 sticky top-0 bg-gray-50 py-2 z-10">
        <button
          onClick={handlePrintClick}
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
        >
          {currentRevPrinted ? "พิมพ์ซ้ำ / บันทึกเป็น PDF" : "พิมพ์ใบสั่งผลิต"}
        </button>
        {currentRevPrinted && (
          <span className="text-sm text-green-700 border border-green-200 bg-green-50 rounded px-3 py-2 whitespace-nowrap">
            ✓ Revision นี้พิมพ์แล้ว{revisionPrintedLabel ? ` — ${revisionPrintedLabel}` : ""}
          </span>
        )}
        {orderStarted && (
          <span className="text-xs text-gray-500 whitespace-nowrap">เริ่มผลิตเมื่อ{startedLabel ? ` ${startedLabel}` : ""}</span>
        )}
        <BackLink
          fallbackHref={backHref}
          label="← ย้อนกลับ"
          className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap"
        />
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h2 className="font-semibold text-base mb-2">ยืนยันว่าพิมพ์ใบสั่งผลิตและส่งเข้าผลิตแล้วหรือไม่?</h2>
            <p className="text-sm text-gray-500 mb-4">
              {orderStarted ? (
                <>
                  ยืนยันเพื่อบันทึกผู้พิมพ์และเวลาของ Revision นี้ (สถานะออเดอร์ยังคงเป็น &quot;{inProgressStatus}&quot; เหมือนเดิม ไม่ใช่การเริ่มผลิตซ้ำ) —
                  พิมพ์ครบ {printCopies} ชุดแล้วใช่ไหม?
                </>
              ) : (
                <>
                  ยืนยันเพื่อเปลี่ยนสถานะเป็น &quot;{inProgressStatus}&quot; พร้อมบันทึกผู้ยืนยันและเวลา — พิมพ์ครบ {printCopies} ชุดแล้วใช่ไหม? (พิมพ์ซ้ำครั้งถัดไปจะไม่ถามอีก)
                </>
              )}
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
