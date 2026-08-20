// ==========================================================================
// PRINT SETTINGS (ข้อ 33) — จุดเดียวที่ต้องแก้ถ้าจะเปลี่ยนขนาดกระดาษ/margin
// แยกจาก Business Logic เด็ดขาด — หน้า print ทุกหน้า import ค่าจากที่นี่
//
// ปัจจุบันตั้งตามเครื่องพิมพ์จริงที่ใช้งาน: EPSON LQ-310 (dot-matrix,
// กระดาษต่อเนื่อง/fanfold ขนาด 9" x 11")
// ==========================================================================

export const PRINT_PAGE_SIZE = "9in 11in";
export const PRINT_MARGIN = "6mm 8mm"; // บน-ล่าง 6mm, ซ้าย-ขวา 8mm (dot-matrix มักมี unprintable margin แถบนอกกว้างกว่าปกติ)

export function printPageStyle(): string {
  return `@media print { @page { size: ${PRINT_PAGE_SIZE}; margin: ${PRINT_MARGIN}; } }`;
}
