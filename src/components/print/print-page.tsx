import { printPageStyleFor, DEFAULT_PRINT_PROFILE } from "@/lib/print-settings";
import { PrintProfileSelector } from "./print-profile-selector";
import { PrintButton } from "@/components/print-button";
import { EditTemplateLink } from "./edit-template-link";
import { buildPrintCssVars, type OverridableTemplateSettings, type DocumentTypeKey } from "@/lib/print-template-settings";

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
  docType,
  canEditTemplate,
  backHref,
  nextHref,
  nextRemaining,
  salesQuestion,
  bodyClassName,
  bodyStyle,
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
  // R6 Phase E.3 Follow-up — Owner ระบุตรงๆ ว่าอยากกดแก้ไขรูปแบบเอกสารได้จากในหน้าเอกสาร
  // เอง ไม่ใช่ต้องไปที่ Global เท่านั้น — ลิงก์ไปหน้า Designer พร้อม Hash Deep-link เดิมที่มี
  // อยู่แล้ว (#QUOTATION ฯลฯ — ดู nav-tree.ts/print-template-designer.tsx) จุดเดียวที่นี่
  // (Shared Shell) กระจายไปทุกหน้า Print ทั้ง 5 อัตโนมัติ ไม่ต้องแก้แยกไฟล์ — Screen-only
  // (อยู่ใน print:hidden Row เดิม) ไม่กระทบ PDF/Print Pipeline เลย
  docType?: DocumentTypeKey;
  /** ต้องเช็คสิทธิ์ฝั่ง Caller (ทุกหน้า Print มี session อยู่แล้ว) เพราะหน้า Designer เอง
   * ต้องการ user.manage — ไม่ Render ลิงก์เลยถ้าไม่มีสิทธิ์ กัน Dead-end ลิงก์ที่กดแล้ว
   * โดน Redirect ออกเฉยๆ */
  canEditTemplate?: boolean;
  /** Owner UAT (2026-08-23) — ปลายทางของปุ่ม "← กลับ" (หน้า Detail ของเอกสาร) — ดูเหตุผล
   * เต็มใน print-button.tsx */
  backHref?: string;
  /** Owner UAT Fix — Multi-Invoice Print Queue: ลิงก์ไปหน้า Print ของใบถัดไปในคิว (พร้อม
   * back/queue ที่เหลือใน Query) — ดู order-invoice-print-panel.tsx สำหรับกลไกคิวเต็ม */
  nextHref?: string;
  /** จำนวนใบที่เหลือในคิว (รวมใบที่ nextHref ชี้) — ใช้แสดงบนปุ่มเท่านั้น */
  nextRemaining?: number;
  /** R13 — ส่งต่อให้ PrintButton: คำถาม "นับเป็นยอดขายไหม" ใน Confirmation Modal (ใบกำกับภาษี) */
  salesQuestion?: string;
  /** Owner UAT (2026-08-29) — Class/Style เพิ่มเติมเฉพาะเอกสารที่ขอ (ตอนนี้มีแค่ Invoice
   * ตามที่ทดสอบกระดาษจริงแล้วขอฟอนต์ใหญ่ขึ้น 30% + ตัวหนาทั้งหมด) — Merge เข้ากับ
   * print-page-fill Container เดิมโดยตรง ไม่เพิ่ม DOM Element ใหม่ กัน Flex Layout เดิม
   * (flex-1 Spacer/mt-auto Signature) เพี้ยน — ไม่ส่ง = พฤติกรรมเดิมทุกประการ */
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
}) {
  const cssVars = templateSettings ? buildPrintCssVars(templateSettings) : undefined;
  return (
    // Owner UAT (2026-08-31) — เจอ Root Cause ที่เป็นไปได้ของปัญหาตกขอบขวาที่ยังไม่หายหลัง
    // จูน Margin/ความกว้างคอลัมน์มา 2 รอบแล้ว: max-w-3xl (768px) ครอบเนื้อหาไว้แบบไม่มี
    // Media Query แยกสำหรับ Print เลย — ค่านี้ตั้งใจไว้แค่จำกัดความกว้างตอน Preview บนจอ
    // (กันหน้าจอกว้างเนื้อหายืดเกินสวยงาม) แต่ตอนพิมพ์จริงบนกระดาษ 9 นิ้ว เนื้อหาควรใช้
    // พื้นที่เท่าที่ @page Margin ของ Print Profile กำหนดไว้เอง ไม่ใช่ถูกจำกัดด้วยเลข 768px
    // ที่ไม่เกี่ยวข้องกับกระดาษจริงเลย — เปิดกว้างเฉพาะตอน Print (print:max-w-none) จอ
    // Preview ยังแคบเหมือนเดิมทุกประการ
    <div className="max-w-3xl mx-auto print:max-w-none print:mx-0">
      <style
        id="print-page-style"
        dangerouslySetInnerHTML={{ __html: `@media print { ${printPageStyleFor(DEFAULT_PRINT_PROFILE)} }` }}
      />
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex flex-wrap items-center gap-3">
          <PrintButton
            markPrintedAction={markPrintedAction}
            isPrinted={isPrinted}
            printedAtLabel={printedAtLabel}
            backHref={backHref}
            nextHref={nextHref}
            nextRemaining={nextRemaining}
            salesQuestion={salesQuestion}
          />
          {canEditTemplate && docType && <EditTemplateLink docType={docType} />}
        </div>
        <PrintProfileSelector />
      </div>
      {/* Owner UAT (2026-08-31 รอบ 5) — p-6 (24px) เดิมกินพื้นที่พิมพ์จริงไปทั้งหมด 48px
          ต่อความกว้าง (ซ้าย+ขวา) โดยไม่จำเป็น — ลดเหลือเฉพาะแนวนอนตอนพิมพ์จริง (px-3 =
          12px ต่อข้าง ยังมีที่ว่างพอสมควรจากขอบ @page Margin เดิมอยู่แล้ว) คืนพื้นที่ที่ได้
          ทั้งหมดให้คอลัมน์ตัวเลขในตารางที่เคยตกขอบ — จอ Preview (ไม่มี print:) ยังคง p-6
          เท่าเดิมทุกประการ แนวตั้ง (บน/ล่าง) ไม่แตะเลย กัน Pagination/Signature เพี้ยน */}
      <div
        className={`print-page-fill bg-white border print:border-0 rounded-lg print:rounded-none p-6 print:px-3 text-sm flex flex-col ${bodyClassName ?? ""}`}
        style={{ ...cssVars, ...bodyStyle } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
