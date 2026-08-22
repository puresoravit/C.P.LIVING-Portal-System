import { printPageStyleFor, DEFAULT_PRINT_PROFILE } from "@/lib/print-settings";
import { PrintProfileSelector } from "./print-profile-selector";
import { PrintButton } from "@/components/print-button";
import { buildPrintCssVars, type OverridableTemplateSettings } from "@/lib/print-template-settings";

// Shared print page shell — ใช้ร่วมกันทุกประเภทเอกสาร (ข้อ 11) มีแค่ส่วน "โครง"
// (พื้นที่พิมพ์/ปุ่มพิมพ์/เลือก Print Profile/ซ่อน Sidebar ผ่าน layout.tsx) — เนื้อหา
// เอกสารจริง (Header/Title/Item Table/Summary/ฯลฯ) ยังเป็นของแต่ละหน้าเอง ไม่ถูก
// บังคับโครงสร้างจาก wrapper นี้
//
// print-page-fill (ดู globals.css) ทำให้ container เป็น flex column สูงเท่าพื้นที่
// พิมพ์จริงตาม Print Profile ที่เลือก (ผ่าน CSS var --print-content-height ที่
// PrintProfileSelector ตั้งให้) เพื่อให้ Signature Block (mt-auto) ไหลลงไปใกล้ท้าย
// กระดาษเมื่อเอกสารมีรายการน้อย — เป็นการประมาณ ต้องตรวจกับกระดาษจริงอีกที
export function PrintPage({
  children,
  markPrintedAction,
  isPrinted,
  printedAtLabel,
  templateSettings,
}: {
  children: React.ReactNode;
  markPrintedAction?: (formData: FormData) => void;
  /** R6 Phase D — true = เอกสารผ่าน PRINTED Checkpoint แล้ว (โชว์วันที่แทนปุ่ม Mark) */
  isPrinted?: boolean;
  printedAtLabel?: string;
  // R5 — ค่าที่ Resolve แล้ว (Global + Override ของเอกสารนี้) ฉีดเป็น CSS Var ที่จุด
  // เดียวนี้ ให้ Shared Print Component ที่เหลือทั้งหมด Inherit ผ่าน Tailwind Arbitrary
  // Value (เช่น text-[length:var(--print-body-size)]) โดยไม่ต้องรับ Prop ซ้ำเอง —
  // Optional เพื่อไม่ Break หน้าอื่นที่อาจยังไม่ได้ส่งมา (Fallback ไป Default ใน globals.css)
  templateSettings?: OverridableTemplateSettings;
}) {
  const cssVars = templateSettings ? buildPrintCssVars(templateSettings) : undefined;
  return (
    <div className="max-w-3xl mx-auto">
      <style
        id="print-page-style"
        dangerouslySetInnerHTML={{ __html: `@media print { ${printPageStyleFor(DEFAULT_PRINT_PROFILE)} }` }}
      />
      <div className="print:hidden flex items-center justify-between gap-3 mb-2">
        <PrintButton markPrintedAction={markPrintedAction} isPrinted={isPrinted} printedAtLabel={printedAtLabel} />
        <PrintProfileSelector />
      </div>
      <div
        className="print-page-fill bg-white border print:border-0 rounded-lg print:rounded-none p-6 text-sm flex flex-col"
        style={cssVars as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
