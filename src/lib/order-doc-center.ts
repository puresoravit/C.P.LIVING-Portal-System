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

// Owner UAT Fix Batch 1 — ข้อ 8: Document Center ("เอกสาร / Document" = /orders) ต้อง
// แสดงสถานะ "พิมพ์แล้ว" ของ Order ได้ด้วย โดยห้ามเพิ่ม OrderStatus.PRINTED ใหม่ (Order
// ไม่มีแนวคิด PRINTED ของตัวเอง — Invoice ต่างหากที่มี) — จึงคำนวณเป็น Derived UI State
// จาก Invoice ลูกที่ Active เท่านั้น (CANCELLED ไม่นับ เหมือน sumActiveInvoiceTotal ทุก
// ประการ) ไม่ใช่ Field ใหม่ใน DB ไม่ใช่ Label หลอก — สะท้อนข้อมูลจริงเสมอ:
//   - ไม่มี Invoice Active เลย → null (ไม่แสดง Derived Badge ใดๆ ทับ Order Status เดิม)
//   - Active ทุกใบ PRINTED → "ALL_PRINTED" (พิมพ์แล้วทั้งหมด)
//   - Active บางใบ PRINTED บางใบไม่ → "PARTIALLY_PRINTED" (พิมพ์บางส่วน)
//   - Active ไม่มีใบไหน PRINTED เลย → null (ปล่อยให้ Order Status เดิม (CONFIRMED ฯลฯ)
//     สื่อความหมายตามปกติ ไม่ต้องมี Derived Badge ซ้ำซ้อน)
export type OrderPrintState = "ALL_PRINTED" | "PARTIALLY_PRINTED" | null;

export function deriveOrderPrintState(invoices: { status: string }[]): OrderPrintState {
  const active = invoices.filter((inv) => inv.status !== "CANCELLED");
  if (active.length === 0) return null;
  const printedCount = active.filter((inv) => inv.status === "PRINTED").length;
  if (printedCount === 0) return null;
  if (printedCount === active.length) return "ALL_PRINTED";
  return "PARTIALLY_PRINTED";
}
