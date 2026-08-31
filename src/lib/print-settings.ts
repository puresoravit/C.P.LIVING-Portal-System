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
    // Owner UAT (2026-08-29) — ทดสอบพิมพ์กระดาษจริงแล้ว: หัวกระดาษ (โลโก้/เลขที่เอกสาร)
    // ชิดขอบบนเกินไป + เนื้อหาฝั่งจำนวนเงินชิด/ตกขอบกระดาษ (ระยะห่างล่างโอเคแล้วไม่แตะ)
    // — เพิ่ม Margin บน 6→10mm และซ้าย-ขวา 8→10mm — ทดสอบรอบ 2 (2026-08-31): หัวกระดาษ
    // เข้าที่แล้ว แต่คอลัมน์ราคา/จำนวนเงินฝั่งขวายังตกขอบอยู่ — เผื่อ Margin ขวาเพิ่มอีก
    // ชั้นเป็น 14mm — รอบ 3-5 ลองแก้ที่ Column Width/Table Layout/Padding แทนหลายรอบ
    // ยังไม่หาย (Physical Print ยืนยันแล้วว่า Item Table และกล่อง Total/Net Amount ถูก
    // Clip ที่แนวขวาเดียวกัน — แปลว่าปัญหาจริงอยู่ที่ระดับ Container/Margin ไม่ใช่แค่
    // ความกว้างคอลัมน์) — รอบ 6: เพิ่ม Margin ขวาเป็น Safety Buffer จริงที่ระดับ mm 14mm →
    // 20mm — Physical Print ยืนยันว่าทิศถูกแล้ว (ตกขอบน้อยลง) แต่ยังไม่พอ — รอบ 7: เพิ่ม
    // อีก +10mm (20mm → 30mm) ตามที่ Owner ระบุช่วง 8-10mm โดยเลือกปลายบนเพื่อกันพลาดซ้ำ
    // เป็นรอบที่ 3 ติดกัน — จงใจไม่แตะ Column Width/Font Size รอบนี้ (Owner สั่งตรงๆ ว่า
    // ให้แก้ที่ระดับ Container/Margin เท่านั้น รักษาสัดส่วน Table/Summary เดิม) — คอลัมน์
    // Fixed-width ทั้งหมด (No/ขนาด/จำนวน/ราคา/จำนวนเงิน) เป็น px คงที่ ไม่ขยับตาม Margin
    // ที่เปลี่ยน มีแต่ "รายการ" (Flexible) ที่แคบลงเล็กน้อยรับ Margin ที่เพิ่มแทน
    margin: "10mm 30mm 6mm 10mm",
    contentHeightMm: 279.4 - 16, // 11in - (10mm บน + 6mm ล่าง) — ขวา/ซ้ายไม่กระทบความสูง
  },
  a4: {
    label: "A4 — Laser/Inkjet ทั่วไป / Save as PDF",
    pageSize: "A4",
    // Smoke Test R4 (2026-08-25) — จูนตามมาร์คสีแดงของ Owner บนกระดาษจริง: หัวกระดาษขึ้น
    // อีกนิด + ท้ายกระดาษลงอีกนิด — Margin บน-ล่าง 6mm → 4mm (Chrome/Safari รุ่นใหม่รองรับ
    // @page margin — ตัวจำกัดจริงคือ Margin ขั้นต่ำของ Printer Driver ค่าเราเล็กกว่าก็แค่
    // ถูก Clamp ไม่ล้นเพิ่ม)
    margin: "4mm 10mm",
    // ประวัติการจูน (Smoke Test 2026-08-25): 297-20 เต็มพอดี → Safari ล้นหน้า 2 เสมอ →
    // Buffer 14mm ยังเกย → 28mm หายล้นแต่ห่างขอบไป → R3: Margin 6mm + Buffer 16mm ยังมี
    // Footer เกยนิดเดียว (Safari ไม่สน break-inside:avoid ตอนพื้นที่เหลือพอดีเป๊ะ) →
    // R4: Margin 4mm + Buffer 14mm = min-height 275mm (Slack จริงใน Safari ~14mm เพียงพอ
    // ให้ Footer Block ไม่โดนตัด) — Profile continuous (EPSON 9×11 ผ่าน Chrome) ทดสอบกับ
    // กระดาษจริงผ่านแล้ว ห้ามแตะเด็ดขาด
    contentHeightMm: 297 - 8 - 14,
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
