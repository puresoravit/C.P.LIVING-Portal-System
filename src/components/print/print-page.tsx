import { printPageStyleFor, DEFAULT_PRINT_PROFILE } from "@/lib/print-settings";
import { PrintProfileSelector } from "./print-profile-selector";
import { PrintButton } from "@/components/print-button";

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
}: {
  children: React.ReactNode;
  markPrintedAction?: (formData: FormData) => void;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <style
        id="print-page-style"
        dangerouslySetInnerHTML={{ __html: `@media print { ${printPageStyleFor(DEFAULT_PRINT_PROFILE)} }` }}
      />
      <div className="print:hidden flex items-center justify-between gap-3 mb-2">
        <PrintButton markPrintedAction={markPrintedAction} />
        <PrintProfileSelector />
      </div>
      <div className="print-page-fill bg-white border print:border-0 rounded-lg print:rounded-none p-6 print:p-0 text-sm flex flex-col">
        {children}
      </div>
    </div>
  );
}
