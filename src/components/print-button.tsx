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

// Owner UAT — Automatic PRINTED Workflow (2026-08-24): เดิมพนักงานต้องกด 2 ครั้งแยกกัน
// (1. "พิมพ์" เปิดกล่องโต้ตอบพิมพ์ของ Browser 2. "มาร์คว่าพิมพ์แล้ว" กดแยกหลังพิมพ์เสร็จ)
// — มีโอกาสลืมขั้นตอนที่ 2 (Invoice ค้างสถานะ CONFIRMED ทั้งที่พิมพ์ 9×11 จริงแล้ว ไม่เข้า
// Sales SOT/Billing Note) — ยุบเหลือปุ่มเดียว: กด "พิมพ์ (9×11)" ครั้งเดียว ระบบเรียก
// window.print() + มาร์ค PRINTED ให้อัตโนมัติ ไม่มี Manual Step ที่ 2 อีกต่อไป
//
// กลไกที่เลือกใช้ — window "afterprint" event: Browser ยิง Event นี้ "หลังกล่องโต้ตอบ
// พิมพ์ถูกปิด" เป็นจังหวะที่ปลอดภัยที่สุดที่ Web API รองรับสำหรับ "ผู้ใช้มีปฏิสัมพันธ์กับ
// การพิมพ์จนจบกระบวนการแล้ว" (ดีกว่ามาร์คทันทีตอนกดปุ่ม ก่อนกล่องโต้ตอบจะเปิดขึ้นมาด้วยซ้ำ)
//
// ⚠️ ข้อจำกัดของ Browser ที่ต้องบอก Owner ตรงๆ (ข้อ 3): ไม่มี Web API ใดยืนยันได้ว่า
// เครื่องพิมพ์จริงพิมพ์กระดาษออกมาสำเร็จหรือไม่ และ "afterprint" ก็ยิงเหมือนกันทั้งกรณี
// ผู้ใช้กด Print และกรณีกด Cancel ในกล่องโต้ตอบ (พฤติกรรมมาตรฐานของ Browser ทุกตัว ไม่ใช่
// บั๊ก) — ระบบจึงไม่สามารถแยกแยะ "พิมพ์จริง" ออกจาก "เปิดกล่องโต้ตอบแล้วกด Cancel" ได้เลย
// สถานะ PRINTED ใน Phase นี้จึงมีความหมายเปลี่ยนจากเดิมเล็กน้อย: "พนักงานกดพิมพ์ด้วย
// โปรไฟล์กระดาษต่อเนื่อง 9×11 แล้วปิดกล่องโต้ตอบพิมพ์ของ Browser" ไม่ใช่ "ยืนยันแล้วว่า
// กระดาษออกจากเครื่องพิมพ์จริง" (ข้อจำกัดเดียวกันนี้มีอยู่แล้วในปุ่ม Manual เดิมด้วย — ปุ่ม
// เดิมก็ไม่เคยมีสัญญาณยืนยันจากเครื่องพิมพ์จริงเช่นกัน เป็น Trust ผู้ใช้เหมือนกันทั้งคู่)
//
// Fallback ปลอดภัย: ถ้าการมาร์คอัตโนมัติ Error จริง (เช่น Network ล่มชั่วขณะ) จะไม่ทำให้
// หน้าเว็บพังไป Error Boundary (พนักงานอาจเพิ่งพิมพ์กระดาษจริงไปแล้ว ไม่ควรเจอหน้า Error) —
// ขึ้น Toast แจ้งเตือน + โชว์ปุ่ม "มาร์คว่าพิมพ์แล้ว" แบบ Manual กลับมาให้กดซ้ำเป็น Safety Net
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
  // โชว์ปุ่ม "พิมพ์ใบถัดไป" เด่นๆ ให้ทำงานต่อได้ทันทีโดยไม่ต้องกลับไปเลือกใหม่
  nextHref?: string;
  nextRemaining?: number;
}) {
  const [profile, setProfile] = useState<PrintProfileKey>(DEFAULT_PRINT_PROFILE);
  const [isPending, startTransition] = useTransition();
  const [autoMarkFailed, setAutoMarkFailed] = useState(false);
  const { showError } = useToast();
  // afterprint Listener ที่ค้างจากคลิกก่อนหน้า (ถ้ามี) — ต้องถอดออกก่อนผูกอันใหม่เสมอ กัน
  // เรียกมาร์คซ้ำสองรอบถ้าผู้ใช้กดปุ่มพิมพ์ซ้ำเร็วๆ ก่อน afterprint รอบแรกจะยิง
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
  // นี้เลย จึงไม่มีทาง Trigger การมาร์คซ้ำหรือมาร์คผิดโปรไฟล์ — Logic แยกเป็น Pure Function
  // ที่ Unit Test ครอบคลุม Invariant "A4 ต้องไม่มาร์คเด็ดขาด" ไว้แล้ว (ดู print-settings.ts)
  const { canAutoMark, showA4Notice } = resolvePrintMarkUiState({
    hasMarkAction: !!markPrintedAction,
    isPrinted: !!isPrinted,
    profile,
  });

  function runAutoMark() {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("printProfile", "continuous");
        await markPrintedAction!(fd);
        setAutoMarkFailed(false);
      } catch (err) {
        unstable_rethrow(err); // ปล่อย redirect()/notFound() signal ของ Next.js ผ่านทันที (ไม่เกิดจริงในเคสนี้ แต่กันไว้ตาม Pattern เดิม)
        setAutoMarkFailed(true);
        showError("พิมพ์เอกสารสำเร็จ แต่ระบบมาร์คว่า 'พิมพ์แล้ว' ไม่สำเร็จ — กรุณากดปุ่ม 'มาร์คว่าพิมพ์แล้ว' ด้านล่างอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  function handlePrintClick() {
    if (!canAutoMark) {
      window.print();
      return;
    }
    afterPrintCleanupRef.current?.();
    const onAfterPrint = () => {
      window.removeEventListener("afterprint", onAfterPrint);
      afterPrintCleanupRef.current = null;
      runAutoMark();
    };
    window.addEventListener("afterprint", onAfterPrint);
    afterPrintCleanupRef.current = () => window.removeEventListener("afterprint", onAfterPrint);
    window.print();
  }

  return (
    // Owner UAT (2026-08-23) — พื้นที่ Toolbar แคบ (Sidebar กินความกว้าง) เคยทำให้ข้อความใน
    // ปุ่ม/ป้ายถูกบีบตัดขึ้นบรรทัดใหม่จนเป็นแนวตั้งอ่านยาก — ใส่ whitespace-nowrap ทุกชิ้น
    // (ข้อความชิ้นหนึ่งอยู่บรรทัดเดียวเสมอ) + flex-wrap ที่ Container (พื้นที่ไม่พอให้ตัดขึ้น
    // แถวใหม่ "ทั้งชิ้น" แทนการบีบตัวอักษร)
    <div className="print:hidden flex flex-wrap items-center gap-2 mb-4 sticky top-0 bg-gray-50 py-2 z-10">
      <button
        onClick={handlePrintClick}
        disabled={isPending}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
      >
        {isPending
          ? "กำลังมาร์คว่าพิมพ์แล้ว..."
          : canAutoMark
            ? "พิมพ์ (9×11) — มาร์คว่าพิมพ์แล้วอัตโนมัติ"
            : "พิมพ์ / บันทึกเป็น PDF"}
      </button>

      {markPrintedAction && isPrinted && (
        <span className="text-sm text-green-700 border border-green-200 bg-green-50 rounded px-3 py-2 whitespace-nowrap">
          ✓ พิมพ์แล้ว{printedAtLabel ? ` เมื่อ ${printedAtLabel}` : ""}
        </span>
      )}

      {showA4Notice && (
        <span className="text-xs text-amber-700 border border-amber-200 bg-amber-50 rounded px-3 py-2 whitespace-nowrap">
          โหมด A4 ไม่นับเป็นยอดขาย (Sales SOT) — เปลี่ยนเป็น &quot;กระดาษต่อเนื่อง 9×11&quot; เพื่อมาร์คว่าพิมพ์แล้วอัตโนมัติ
        </span>
      )}

      {/* Safety Net — โผล่เฉพาะตอนมาร์คอัตโนมัติ Error จริงเท่านั้น (ดู Comment บนสุดของไฟล์) */}
      {autoMarkFailed && canAutoMark && (
        <form action={markPrintedAction}>
          <input type="hidden" name="printProfile" value={profile} />
          <button className="text-sm text-red-700 border border-red-300 bg-red-50 hover:bg-red-100 rounded px-4 py-2 whitespace-nowrap">
            มาร์คว่าพิมพ์แล้ว (ลองอีกครั้ง)
          </button>
        </form>
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
  );
}
