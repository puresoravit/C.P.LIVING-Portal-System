import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// E3 — ตรวจว่า Order ที่ Confirmed แล้วแก้ไขได้หรือไม่ (pure function, ไม่แตะ DB
// เพื่อให้ unit test ได้ตรงๆ) ตาม Business Rule ที่อนุมัติ (แก้ไขรอบ 2 หลังพบว่า
// เวอร์ชันแรกเช็ค "inconsistent" จาก Invoice ที่ CANCELLED แล้วทุกใบตลอดประวัติศาสตร์
// ทำให้ Order ที่ถูกแก้ไขไปแล้ว 1 ครั้งแก้ไขซ้ำไม่ได้อีกเลย — Invoice ที่ CANCELLED
// แล้วคือ Historical Record เท่านั้น ห้ามนำมาตัดสิน Inconsistent อีกต่อไป):
//  - ต้องเป็นสถานะ CONFIRMED เท่านั้น
//  - พิจารณาจาก Active Invoice ปัจจุบัน + downstream reference เท่านั้น — Cancelled
//    Invoice เก่ากี่ใบก็ได้ไม่ block
//  - ถ้าไม่มี Active Invoice เหลือเลย (ทั้งที่ Order ควรมี) ถือเป็น Abnormal State
//    ต้อง Refuse/รายงาน ห้ามสร้าง Invoice ใหม่เองโดยเดา
//  - ถ้า Active Invoice ใดถูกอ้างอิงต่อแล้ว (TaxInvoice ที่ยัง Active หรือถูกวางบิลแล้ว)
//    ต้อง Lock พร้อมเหตุผลที่ตรงกับ downstream นั้น ให้ใช้ Copy Order แทน
//  - ถ้า Active Invoice บาง ใบ PRINTED แต่ไม่มีการอ้างอิงต่อ ยัง Edit ได้ แต่ต้อง
//    Acknowledge Warning ก่อน
export type OrderEditGuardResult =
  | { kind: "not-applicable" }
  | { kind: "no-active-invoices" }
  | { kind: "locked"; reasons: Array<"tax-invoice" | "billing-note"> }
  | { kind: "editable"; requiresPrintedAck: boolean };

export function checkOrderEditable(params: {
  orderStatus: string;
  invoiceStatuses: string[];
  invoicesWithBillingNote: number;
  hasActiveTaxInvoiceReference: boolean;
}): OrderEditGuardResult {
  if (params.orderStatus !== "CONFIRMED") return { kind: "not-applicable" };

  const activeStatuses = params.invoiceStatuses.filter((s) => s !== "CANCELLED");
  if (activeStatuses.length === 0) return { kind: "no-active-invoices" };

  const reasons: Array<"tax-invoice" | "billing-note"> = [];
  if (params.invoicesWithBillingNote > 0) reasons.push("billing-note");
  if (params.hasActiveTaxInvoiceReference) reasons.push("tax-invoice");
  if (reasons.length > 0) return { kind: "locked", reasons };

  const requiresPrintedAck = activeStatuses.some((s) => s === "PRINTED");
  return { kind: "editable", requiresPrintedAck };
}

/**
 * ดึงข้อมูลจาก DB แล้วเรียก checkOrderEditable — ใช้ทั้งจากหน้า Order detail (แสดงผล
 * ด้วย client = db ปกติ) และจากภายใน Transaction ของ editConfirmedOrder (ต้อง re-check
 * สดๆ กัน race condition ด้วย client = tx) รับ Prisma Client แบบเดียวกับ getNextSeq
 */
export async function fetchOrderEditGuard(
  orderId: string,
  client: Prisma.TransactionClient | typeof db = db
): Promise<OrderEditGuardResult> {
  const order = await client.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { invoices: true },
  });

  const activeInvoiceIds = order.invoices.filter((i) => i.status !== "CANCELLED").map((i) => i.id);
  const activeTaxInvoiceCount =
    activeInvoiceIds.length === 0
      ? 0
      : await client.taxInvoice.count({
          where: { referenceInvoiceId: { in: activeInvoiceIds }, status: { not: "CANCELLED" } },
        });

  return checkOrderEditable({
    orderStatus: order.status,
    invoiceStatuses: order.invoices.map((i) => i.status),
    invoicesWithBillingNote: order.invoices.filter((i) => i.status !== "CANCELLED" && i.billingNoteId != null).length,
    hasActiveTaxInvoiceReference: activeTaxInvoiceCount > 0,
  });
}
