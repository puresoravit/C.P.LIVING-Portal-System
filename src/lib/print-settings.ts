// ==========================================================================
// PRINT SETTINGS — Phase D
// รองรับ 2 Print Profile ตามที่อนุมัติ: กระดาษต่อเนื่อง 9×11" (EPSON LQ-310 ที่ใช้
// งานจริงอยู่) และ A4 (printer ทั่วไป/Save as PDF) — ผู้ใช้เลือกได้ที่หน้า print
// แต่ละใบผ่าน PrintProfileSelector (client component, จำค่าไว้ใน localStorage)
//
// contentHeightMm ใช้ประมาณความสูงพื้นที่พิมพ์จริง (page height - margin บน-ล่าง)
// เพื่อดัน Signature Block ลงไปใกล้ท้ายกระดาษเมื่อเอกสารมีรายการน้อย (ข้อ 6.8) —
// เป็นค่าประมาณด้วย CSS ล้วนๆ ไม่ใช่การวัดจริงจาก printer ต้องตรวจกับกระดาษจริง
// อีกครั้งใน Manual UAT
// ==========================================================================

export type PrintProfileKey = "continuous" | "a4";

// R6 Phase D — Shared ระหว่าง PrintProfileSelector (เขียน) กับ PrintButton (อ่าน เพื่อ
// เปิด/ปิดปุ่ม "มาร์คว่าพิมพ์แล้ว" ตาม Profile ที่เลือกอยู่จริง) — ยังคงเป็น
// localStorage ล้วนๆ ไม่ลง Database ตามสถาปัตยกรรมเดิมของ R5 ทุกประการ
export const PRINT_PROFILE_STORAGE_KEY = "billSystemPrintProfile";
export const PRINT_PROFILE_CHANGE_EVENT = "print-profile-change";

export const PRINT_PROFILES: Record<
  PrintProfileKey,
  { label: string; pageSize: string; margin: string; contentHeightMm: number }
> = {
  continuous: {
    label: "9×11 นิ้ว — กระดาษต่อเนื่อง (EPSON LQ-310)",
    pageSize: "9in 11in",
    margin: "6mm 8mm",
    contentHeightMm: 279.4 - 12, // 11in - (6mm บน + 6mm ล่าง)
  },
  a4: {
    label: "A4 — Laser/Inkjet ทั่วไป / Save as PDF",
    pageSize: "A4",
    margin: "10mm 12mm",
    // Production Smoke Test (2026-08-25) — เดิม 297-20 = เต็มพื้นที่พิมพ์พอดีเป๊ะ ทำให้
    // .print-page-fill (min-height ตามค่านี้) ล้นเป็นหน้าที่ 2 เปล่าๆ ใน Safari เสมอ:
    // Safari ไม่รองรับ @page { size } และใช้ Margin ของตัวเอง (~12mm+) ที่ใหญ่กว่าที่เรา
    // ประกาศ (10mm) → พื้นที่จริงเตี้ยกว่าที่คำนวณ + การแปลง mm→px มีปัดเศษ — รอบแรกหัก
    // 14mm แล้ว Owner ทดสอบจริงยังเกยอีกนิด (Safari + RICOH driver กิน Margin มากกว่าที่
    // ประเมิน) → เพิ่มเป็น 28mm — ผลข้างเคียงมีแค่ Signature Block ขยับขึ้นจากท้ายกระดาษ
    // ~1.5cm เมื่อรายการน้อย ซึ่งยอมรับได้ — Profile continuous (EPSON 9×11 ผ่าน Chrome)
    // ทดสอบกับกระดาษจริงผ่านแล้ว ห้ามแตะ
    contentHeightMm: 297 - 20 - 28,
  },
};

export const DEFAULT_PRINT_PROFILE: PrintProfileKey = "continuous";

export function printPageStyleFor(profile: PrintProfileKey): string {
  const p = PRINT_PROFILES[profile];
  // Owner UAT (2026-08-23) — วันที่/ชื่อเว็บ/URL/เลขหน้า ตัวเล็กๆ ที่ติดมาบนกระดาษเป็น
  // "Headers and footers" ที่ Browser พิมพ์เองในพื้นที่ Margin (ไม่ใช่เนื้อหาจากแอพ) —
  // กำหนด CSS Page Margin Box ทุกตำแหน่งเป็นค่าว่าง เพื่อทับค่า Default ของ Browser
  // (Chromium รองรับตั้งแต่ v131) — ไม่แตะขนาด Margin/พื้นที่พิมพ์เดิมแม้แต่นิดเดียว
  // (Pagination/ความสูงพื้นที่พิมพ์เดิมไม่เปลี่ยน) — Browser เวอร์ชันเก่าที่ไม่รองรับจะ
  // เห็นเหมือนเดิม (ปิดได้เองที่ Print Dialog > More settings > Headers and footers)
  const emptyMarginBoxes =
    "@top-left { content: '' } @top-center { content: '' } @top-right { content: '' } " +
    "@bottom-left { content: '' } @bottom-center { content: '' } @bottom-right { content: '' }";
  return `@page { size: ${p.pageSize}; margin: ${p.margin}; ${emptyMarginBoxes} }`;
}

// เผื่อโค้ดเก่าที่ยัง import ชื่อนี้อยู่ระหว่างการ refactor — เท่ากับ profile default
export function printPageStyle(): string {
  return `@media print { ${printPageStyleFor(DEFAULT_PRINT_PROFILE)} }`;
}

// Owner UAT — Safe 9×11 PRINTED Confirmation (2026-08-24): Pure Decision Logic แยก
// ออกมาจาก PrintButton (Client Component) เพื่อ Unit Test ได้ตรงๆ โดยไม่ต้องพึ่ง
// Browser จริง — ครอบคลุม Invariant ที่สำคัญที่สุดของ Feature นี้: "A4 ต้องไม่เปิด
// Confirmation Modal และไม่มาร์ค PRINTED เด็ดขาด ไม่ว่ากรณีใด" (canOpenPrintConfirm
// ต้องเป็น false เสมอเมื่อ profile !== "continuous" — Short-circuit ที่ Server ก็
// เช็คซ้ำอีกชั้นใน markInvoicePrinted อยู่แล้ว เป็น Defense-in-depth 2 ชั้นเหมือนเดิม)
//
// เดิม (afterprint ยิงแล้วมาร์คทันที) พบ Bug จริงจาก Physical UAT: afterprint ยิง
// เหมือนกันทั้งกด Print และกด Cancel ใน Browser Print Dialog — Owner สั่งยกเลิก
// การมาร์คอัตโนมัติจาก Event นี้โดยตรง เปลี่ยนเป็น "afterprint = เปิด Confirmation
// Modal เท่านั้น" แล้วให้พนักงานยืนยันเองว่า "พิมพ์สำเร็จ" ก่อนถึงจะเรียก
// markInvoicePrinted จริง — ชื่อ canOpenPrintConfirm (เดิม canAutoMark) สะท้อนเจตนา
// ใหม่ตรงๆ: เงื่อนไขนี้คุมแค่ "เปิด Modal ให้ถามได้ไหม" ไม่ใช่ "มาร์คให้เลยไหม"
export function resolvePrintMarkUiState(params: {
  /** false = Invoice ถูกยกเลิกแล้ว (markPrintedAction เป็น undefined จาก Caller) */
  hasMarkAction: boolean;
  isPrinted: boolean;
  profile: PrintProfileKey;
}): { canOpenPrintConfirm: boolean; showA4Notice: boolean } {
  const eligible = params.hasMarkAction && !params.isPrinted;
  return {
    canOpenPrintConfirm: eligible && params.profile === "continuous",
    showA4Notice: eligible && params.profile !== "continuous",
  };
}
