"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import {
  DEFAULT_PRINT_PROFILE,
  PRINT_PROFILE_STORAGE_KEY,
  PRINT_PROFILE_CHANGE_EVENT,
  resolvePrintMarkUiState,
  type PrintProfileKey,
} from "@/lib/print-settings";

// Owner UAT — Safe 9×11 PRINTED Confirmation (2026-08-24): Physical UAT ของรอบก่อน
// (Automatic PRINTED Workflow) เจอ Bug จริง — window "afterprint" ยิงเหมือนกันทั้งกด
// Print และกด Cancel ใน Browser Print Dialog (พฤติกรรมมาตรฐานของทุก Browser ไม่ใช่
// บั๊ก) ทำให้กด Cancel ก็ถูกมาร์ค PRINTED ไปด้วย กระทบ Sales SOT/Dashboard/Billing
// Note ผิดจากความเป็นจริง — Owner สั่งยกเลิกการเขียน DB จาก afterprint โดยตรงเด็ดขาด
//
// Flow ใหม่: กดพิมพ์ (9×11) → window.print() (เปิด Browser Print Dialog) → ปิด
// Dialog (afterprint ยิง) → **แค่เปิด Confirmation Modal** ถามว่า "พิมพ์เอกสารออก
// เรียบร้อยแล้วหรือไม่?" → พนักงานตอบเอง 2 ทาง:
//   - "พิมพ์สำเร็จ" → เรียก markPrintedAction (Server Action/CAS เดิม) จริง → PRINTED
//   - "ยังไม่ได้พิมพ์ / ยกเลิก" → ปิด Modal เฉยๆ ไม่มีการเขียน DB ใดๆ ทั้งสิ้น Invoice
//     ยังคง CONFIRMED เหมือนเดิม กดปุ่มพิมพ์ใหม่ได้ตามปกติ (Idempotent — Modal นี้เปิด
//     ซ้ำได้ไม่จำกัดจนกว่าจะมีคนกด "พิมพ์สำเร็จ" จริง)
//
// ⚠️ ตามที่ Owner สั่งชัดเจน: ห้ามใช้ Heuristic ใดๆ (เวลาเปิด Dialog, focus/blur,
// timeout) มาเดาว่าผู้ใช้กด Print หรือ Cancel เพราะไม่ Reliable — afterprint ในไฟล์นี้
// จึงมีหน้าที่เดียวคือ "เปิด Modal ให้ถามคน" ไม่เคย Trigger การเขียน Database เอง
// เด็ดขาด — การมาร์ค PRINTED เกิดจากการกดปุ่มของมนุษย์เท่านั้น (เหมือนปุ่ม Manual เดิม
// ก่อน Phase Automatic — ต่างกันแค่ Flow นำไปสู่ปุ่มนั้นให้อัตโนมัติขึ้น ไม่ต้องจำเอง)
//
// ข้อจำกัดของ Browser ที่ยังเป็นจริงเหมือนเดิม (ต้องบอก Owner ตรงๆ ต่อไป): ไม่มี Web
// API ใดยืนยันได้ว่าเครื่องพิมพ์จริงพิมพ์กระดาษออกมาสำเร็จ — "พิมพ์สำเร็จ" ใน Modal นี้
// คือคำยืนยันของมนุษย์ (พนักงานเห็นกระดาษออกจากเครื่องด้วยตาตัวเอง) ไม่ใช่สัญญาณจาก
// Hardware ผ่าน Browser แต่อย่างใด — Semantic ของ PRINTED กลับไปเหมือนปุ่ม Manual เดิม
// ทุกประการ (Human-confirmed) เพียงแต่ Flow พาไปถึงปุ่มนั้นให้เองไม่ต้องจำ
export function PrintButton({
  markPrintedAction,
  isPrinted,
  printedAtLabel,
  backHref,
  nextHref,
  nextRemaining,
}: {
  markPrintedAction?: (formData: FormData) => void;
  /** true = เอกสารนี้ผ่าน PRINTED Checkpoint แล้ว (โชว์วันที่แทนปุ่ม) */
  isPrinted?: boolean;
  printedAtLabel?: string;
  // Owner UAT (2026-08-23) — เดิมปุ่ม "← กลับ" ใช้ history.back() ซึ่งพากลับไป "หน้าที่มา
  // ล่าสุด" — ถ้าเพิ่งกลับมาจากหน้าแก้ไขฟอร์ม (Document Designer) จะวนกลับไปหน้าแก้ไขฟอร์ม
  // อีกรอบแทนที่จะกลับหน้าเอกสาร — แก้เป็นลิงก์ตรงไปหน้า Detail ของเอกสาร (หน้าคีย์สินค้า)
  // เสมอเมื่อหน้า Print ระบุมา — ไม่ระบุ = Fallback history.back() เดิม (กันหน้าเก่าพัง)
  backHref?: string;
  // Owner UAT Fix — Multi-Invoice Print Queue: มีค่า = กำลังพิมพ์เรียงคิวจาก Order —
  // โชว์ปุ่ม "พิมพ์ใบถัดไป" เด่นๆ ให้ทำงานต่อได้ทันทีโดยไม่ต้องกลับไปเลือกใหม่ — ลิงก์นี้
  // เป็นอิสระจาก Confirmation Modal เสมอ (ไม่ผูกเงื่อนไขว่าต้องยืนยันพิมพ์สำเร็จก่อน) แต่
  // Modal เองมี z-index สูงกว่า Toolbar จึงบังการคลิกลิงก์นี้ไว้ระหว่างที่ Modal เปิดอยู่
  // อัตโนมัติอยู่แล้ว (กันกดข้ามใบโดยไม่ตั้งใจระหว่างรอตอบ Modal)
  nextHref?: string;
  nextRemaining?: number;
}) {
  const [profile, setProfile] = useState<PrintProfileKey>(DEFAULT_PRINT_PROFILE);
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const { showError } = useToast();
  // afterprint Listener ที่ค้างจากคลิกก่อนหน้า (ถ้ามี) — ต้องถอดออกก่อนผูกอันใหม่เสมอ กัน
  // เปิด Modal ซ้อนสองรอบถ้าผู้ใช้กดปุ่มพิมพ์ซ้ำเร็วๆ ก่อน afterprint รอบแรกจะยิง
  const afterPrintCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(PRINT_PROFILE_STORAGE_KEY) as PrintProfileKey | null;
    if (saved) setProfile(saved);
    function handleChange(e: Event) {
      setProfile((e as CustomEvent<PrintProfileKey>).detail);
    }
    window.addEventListener(PRINT_PROFILE_CHANGE_EVENT, handleChange);
    return () => {
      window.removeEventListener(PRINT_PROFILE_CHANGE_EVENT, handleChange);
      afterPrintCleanupRef.current?.();
    };
  }, []);

  // ต้องมี markPrintedAction (ไม่ใช่เอกสาร CANCELLED) + ยังไม่เคย PRINTED + โปรไฟล์เป็น
  // 9×11 อยู่จริงตอนกด — ตรงเงื่อนไขเดียวกับที่ Server เช็คซ้ำใน markInvoicePrinted
  // (Defense-in-depth เดิม ไม่เปลี่ยน) — Reprint (isPrinted=true) และ A4 ไม่มีทางเข้าเงื่อนไข
  // นี้เลย จึงไม่มีทาง Trigger Modal หรือมาร์คผิดโปรไฟล์ — Logic แยกเป็น Pure Function
  // ที่ Unit Test ครอบคลุม Invariant "A4 ต้องไม่เปิด Modal เด็ดขาด" ไว้แล้ว (print-settings.ts)
  const { canOpenPrintConfirm, showA4Notice } = resolvePrintMarkUiState({
    hasMarkAction: !!markPrintedAction,
    isPrinted: !!isPrinted,
    profile,
  });

  function handlePrintClick() {
    if (!canOpenPrintConfirm) {
      window.print();
      return;
    }
    afterPrintCleanupRef.current?.();
    // afterprint มีหน้าที่เดียว: เปิด Modal ให้ถามคน — ห้ามเขียน DB ตรงนี้เด็ดขาด
    // (Root Cause ของ Bug รอบก่อน: afterprint ยิงเหมือนกันทั้งกด Print และกด Cancel)
    const onAfterPrint = () => {
      window.removeEventListener("afterprint", onAfterPrint);
      afterPrintCleanupRef.current = null;
      setShowConfirm(true);
    };
    window.addEventListener("afterprint", onAfterPrint);
    afterPrintCleanupRef.current = () => window.removeEventListener("afterprint", onAfterPrint);
    window.print();
  }

  // "พิมพ์สำเร็จ" — จุดเดียวในไฟล์นี้ที่เรียก markPrintedAction จริง (มนุษย์กดยืนยันเอง
  // หลังเห็นกระดาษออกจากเครื่องแล้วเท่านั้น) — Error (เช่น Network ล่วง) ไม่ปิด Modal ให้
  // เอง (กันพนักงานเข้าใจผิดว่าสำเร็จ) แสดง Toast แล้วปล่อยให้กดซ้ำได้เลยในกล่องเดิม
  function handleConfirmPrinted() {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("printProfile", "continuous");
        await markPrintedAction!(fd);
        setShowConfirm(false);
      } catch (err) {
        unstable_rethrow(err); // ปล่อย redirect()/notFound() signal ของ Next.js ผ่านทันที (ไม่เกิดจริงในเคสนี้ แต่กันไว้ตาม Pattern เดิม)
        showError("มาร์คว่าพิมพ์แล้วไม่สำเร็จ — กรุณาลองกด 'พิมพ์สำเร็จ' อีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  // "ยังไม่ได้พิมพ์ / ยกเลิก" — ปิด Modal เฉยๆ ไม่มีการเขียน DB ใดๆ ทั้งสิ้น Invoice ยัง
  // CONFIRMED เหมือนเดิม — ไม่ Navigate ไปไหนทั้งสิ้น (กันข้าม Invoice ใน Queue โดยไม่ตั้งใจ)
  function handleNotPrinted() {
    setShowConfirm(false);
  }

  return (
    // Modal ถูกวางเป็น Sibling ของ Toolbar (ไม่ใช่ Child) โดยตั้งใจ — Toolbar เป็น
    // position:sticky (สร้าง Stacking Context ของตัวเอง) การซ้อน Modal ไว้ข้างในอาจทำให้
    // z-index ของ Modal ถูกตีความสัมพันธ์กับ Context ของ Toolbar แทนที่จะเป็น Overlay
    // เต็มหน้าจอที่คาดไว้ — แยกเป็น Sibling ระดับบนสุดตัดปัญหานี้ทิ้งไปเลย (Pattern เดียวกับ
    // OrderEditModal/QuotationEditModal ที่ Trigger Button กับ Modal เป็น Sibling กันเสมอ)
    <>
      {/* Owner UAT (2026-08-23) — พื้นที่ Toolbar แคบ (Sidebar กินความกว้าง) เคยทำให้ข้อความใน
          ปุ่ม/ป้ายถูกบีบตัดขึ้นบรรทัดใหม่จนเป็นแนวตั้งอ่านยาก — ใส่ whitespace-nowrap ทุกชิ้น
          (ข้อความชิ้นหนึ่งอยู่บรรทัดเดียวเสมอ) + flex-wrap ที่ Container (พื้นที่ไม่พอให้ตัดขึ้น
          แถวใหม่ "ทั้งชิ้น" แทนการบีบตัวอักษร) */}
      <div className="print:hidden flex flex-wrap items-center gap-2 mb-4 sticky top-0 bg-gray-50 py-2 z-10">
      <button
        onClick={handlePrintClick}
        disabled={showConfirm}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
      >
        {canOpenPrintConfirm ? "พิมพ์ (9×11)" : "พิมพ์ / บันทึกเป็น PDF"}
      </button>

      {markPrintedAction && isPrinted && (
        <span className="text-sm text-green-700 border border-green-200 bg-green-50 rounded px-3 py-2 whitespace-nowrap">
          ✓ พิมพ์แล้ว{printedAtLabel ? ` เมื่อ ${printedAtLabel}` : ""}
        </span>
      )}

      {showA4Notice && (
        <span className="text-xs text-amber-700 border border-amber-200 bg-amber-50 rounded px-3 py-2 whitespace-nowrap">
          โหมด A4 ไม่นับเป็นยอดขาย (Sales SOT) — เปลี่ยนเป็น &quot;กระดาษต่อเนื่อง 9×11&quot; เพื่อยืนยันว่าพิมพ์แล้วหลังพิมพ์เสร็จ
        </span>
      )}

      {nextHref && (
        <a
          href={nextHref}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
        >
          พิมพ์ใบถัดไป / Next Invoice{nextRemaining ? ` (เหลือ ${nextRemaining} ใบ)` : ""} →
        </a>
      )}

      {backHref ? (
        <a href={backHref} className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap">
          ← กลับ
        </a>
      ) : (
        <button
          onClick={() => window.history.back()}
          className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap"
        >
          ← กลับ
        </button>
      )}
      </div>

      {/* Confirmation Modal — เปิดจาก afterprint เท่านั้น (ไม่เคยเขียน DB เอง) — z-40
          คลุมทั้งหน้ารวมถึง Toolbar ด้านบน (กันกด "พิมพ์ใบถัดไป"/ปุ่มอื่นข้ามไประหว่างรอ
          ตอบ Modal โดยไม่ตั้งใจ) */}
      {showConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h2 className="font-semibold text-base mb-2">พิมพ์เอกสารออกเรียบร้อยแล้วหรือไม่?</h2>
            <p className="text-sm text-gray-500 mb-4">
              ระบบไม่สามารถตรวจสอบจากเครื่องพิมพ์ได้โดยตรง — กรุณายืนยันหลังเห็นกระดาษออกจากเครื่องแล้วเท่านั้น
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleNotPrinted}
                disabled={isPending}
                className="text-sm border rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              >
                ยังไม่ได้พิมพ์ / ยกเลิก
              </button>
              <button
                onClick={handleConfirmPrinted}
                disabled={isPending}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
              >
                {isPending ? "กำลังบันทึก..." : "พิมพ์สำเร็จ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
