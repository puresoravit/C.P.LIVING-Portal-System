import { Decimal } from "@prisma/client/runtime/library";

// Phase Doc-Center — รวมยอด Invoice ลูกของ Order สำหรับแถว Parent โดยไม่นับ Invoice
// ที่ CANCELLED (ทั้งจาก Cancel ปกติ และจากการแทนที่ด้วย Invoice รุ่นใหม่ผ่าน E3) —
// Invoice รุ่นเก่าที่ถูกยกเลิกยังต้องคงอยู่เป็น Historical Document ใน Drill-down
// (ห้าม Delete/ซ่อน) แต่ห้ามรวมในยอด Parent เพราะจะทำให้ยอดซ้ำกับ Invoice รุ่นใหม่
export function sumActiveInvoiceTotal(invoices: { status: string; grandTotal: Decimal | number | string }[]): Decimal {
  return invoices
    .filter((inv) => inv.status !== "CANCELLED")
    .reduce((sum, inv) => sum.add(new Decimal(inv.grandTotal)), new Decimal(0));
}
