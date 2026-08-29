"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// S4 UAT round 2 (2026-08-29) — Owner ถาม: ออก Rev ใหม่หลังเริ่มผลิตไปแล้ว ต้องไม่ถูกมองเป็น
// แค่ "พิมพ์ซ้ำ" — ProductionOrder.เริ่มผลิตหรือยัง กับ Revision ปัจจุบัน.พิมพ์แล้วหรือยัง
// เป็นคนละแกนกัน 3 สถานะที่เป็นไปได้:
//   1) ยังไม่เคยเริ่มผลิตเลย (orderStarted=false) → "ยืนยันเริ่มผลิตและพิมพ์"
//   2) เคยเริ่มผลิตแล้ว แต่ Revision ปัจจุบันยังไม่เคยพิมพ์ (orderStarted=true,
//      currentRevPrinted=false — เกิดจากออก Rev ใหม่หลังเริ่มผลิต) → "ยืนยันพิมพ์ Revision
//      ใหม่" (คำพูดต้องไม่บอกว่า "เริ่มผลิต" ซ้ำ เพราะไม่ใช่)
//   3) Revision ปัจจุบันพิมพ์ไปแล้ว (currentRevPrinted=true) → "พิมพ์ซ้ำ" ไม่มี modal ไม่แตะ state
//
// ไม่ใช้ afterprint event เปลี่ยน state เด็ดขาด (บทเรียนจริงของ Billing: afterprint ยิง
// เหมือนกันทั้งกด Print และกด Cancel) — state เปลี่ยนจากปุ่ม explicit ของมนุษย์เท่านั้น
// ก่อนเปิด print dialog เสมอ ทั้ง 2 กรณี (1)/(2) เรียก action เดียวกัน (confirmPrintRevision)
// ซึ่ง server เป็นผู้ตัดสินเองว่าเป็นกรณีไหนจาก CAS อิสระ 2 ชุด (ดู actions.ts)
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

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await confirmAction();
        if (!result.success) {
          showError(result.error);
          return;
        }
        setShowConfirm(false);
        window.print();
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
          Revision นี้ยังไม่เคยพิมพ์ — ต้องพิมพ์ให้ครบ {printCopies} ชุดก่อนส่งของขึ้นสาย (ออเดอร์ยังคงสถานะ &quot;{inProgressStatus}&quot; เดิม ไม่ใช่การเริ่มผลิตใหม่)
        </div>
      )}

      <div className="print:hidden flex flex-wrap items-center gap-2 mb-4 sticky top-0 bg-gray-50 py-2 z-10">
        {currentRevPrinted ? (
          <>
            <button
              onClick={() => window.print()}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
            >
              พิมพ์ซ้ำ / บันทึกเป็น PDF
            </button>
            <span className="text-sm text-green-700 border border-green-200 bg-green-50 rounded px-3 py-2 whitespace-nowrap">
              ✓ Revision นี้พิมพ์แล้ว{revisionPrintedLabel ? ` — ${revisionPrintedLabel}` : ""}
            </span>
          </>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
          >
            {orderStarted ? "ยืนยันพิมพ์ Revision ใหม่" : "ยืนยันเริ่มผลิตและพิมพ์"}
          </button>
        )}
        {orderStarted && (
          <span className="text-xs text-gray-500 whitespace-nowrap">เริ่มผลิตเมื่อ{startedLabel ? ` ${startedLabel}` : ""}</span>
        )}
        <a href={backHref} className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap">
          ← กลับ
        </a>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h2 className="font-semibold text-base mb-2">{orderStarted ? "ยืนยันพิมพ์ Revision ใหม่?" : "ยืนยันเริ่มผลิตใบนี้?"}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {orderStarted ? (
                <>
                  Revision นี้ยังไม่เคยพิมพ์ — ยืนยันเพื่อบันทึกผู้พิมพ์และเวลา แล้วเปิดหน้าต่างพิมพ์ (สถานะออเดอร์ยังคงเป็น
                  &quot;{inProgressStatus}&quot; เหมือนเดิม ไม่ใช่การเริ่มผลิตซ้ำ)
                </>
              ) : (
                <>
                  สถานะจะเปลี่ยนเป็น &quot;{inProgressStatus}&quot; พร้อมบันทึกผู้ยืนยันและเวลา จากนั้นเปิดหน้าต่างพิมพ์ —
                  การพิมพ์ซ้ำครั้งถัดไปจะไม่เปลี่ยนสถานะอีก
                </>
              )}
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
                onClick={handleConfirm}
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
