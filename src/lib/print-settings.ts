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
    contentHeightMm: 297 - 20, // A4 297mm - (10mm บน + 10mm ล่าง)
  },
};

export const DEFAULT_PRINT_PROFILE: PrintProfileKey = "continuous";

export function printPageStyleFor(profile: PrintProfileKey): string {
  const p = PRINT_PROFILES[profile];
  return `@page { size: ${p.pageSize}; margin: ${p.margin}; }`;
}

// เผื่อโค้ดเก่าที่ยัง import ชื่อนี้อยู่ระหว่างการ refactor — เท่ากับ profile default
export function printPageStyle(): string {
  return `@media print { ${printPageStyleFor(DEFAULT_PRINT_PROFILE)} }`;
}
