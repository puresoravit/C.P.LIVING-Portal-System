import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// E3 — ตรวจว่า Order ที่ Confirmed แล้วแก้ไขได้หรือไม่ (pure function, ไม่แตะ DB
// เพื่อให้ unit test ได้ตรงๆ) ตาม Business Rule ที่อนุมัติ (แก้ไขรอบ 2 หลังพบว่า
// เวอร์ชันแรกเช็ค "inconsistent" จาก Invoice ที่ CANCELLED แล้วทุกใบตลอดประวัติศาสตร์
// ทำให้ Order ที่ถูกแก้ไขไปแล้ว 1 ครั้งแก้ไขซ้ำไม่ได้อีกเลย — Invoice ที่ CANCELLED
// แล้วคือ Historical Record เท่านั้น ห้ามนำมาตัดสิน Inconsistent อีกต่อไป):
//  - ต้องเป็นสถานะ CONFIRMED เท่านั้น
//  - พิจารณาจาก Active Invoice ปัจจุบันเท่านั้น — Cancelled Invoice เก่ากี่ใบก็ได้ไม่ block
//  - ถ้าไม่มี Active Invoice เหลือเลย (ทั้งที่ Order ควรมี) ถือเป็น Abnormal State
//    ต้อง Refuse/รายงาน ห้ามสร้าง Invoice ใหม่เองโดยเดา
//  - ถ้า Active Invoice บางใบ PRINTED ยัง Edit ได้เสมอ แต่ต้อง Acknowledge Warning ก่อน
//
// Owner UAT (2026-08-29) — เดิม Invoice ที่มี TaxInvoice/BillingNote อ้างอิงแล้วจะ Lock
// แก้ไขไม่ได้เลย (บังคับ Copy Order แทน) — Owner ยืนยันให้ปลดล็อกแล้ว: "ใบกำกับภาษีจะไม่มี
// แก้ไข ไม่ต้องทำอะไรก็ได้กับใบกำกับภาษี แก้แค่ใบส่งของ เพราะใบกำกับภาษีจะมาพิมพ์ทีหลัง
// แต่ละสิ้นเดือนอยู่แล้ว" — คือใบกำกับภาษี/ใบวางบิลที่ออกไปแล้วไม่ต้องอัปเดตตามเลย ปล่อยให้
// รอบออกเอกสารครั้งถัดไปดึงยอดปัจจุบันของ Invoice เองตามปกติ — เอา "locked" kind ออก
// ทั้งหมด เหลือแค่รายงาน downstreamReferences ให้ UI โชว์เป็นข้อความแจ้งเตือนเฉยๆ
// (ไม่ Block) ว่าใบกำกับภาษี/ใบวางบิลที่ออกไปแล้วจะไม่ถูกแตะ
export type OrderEditGuardResult =
  | { kind: "not-applicable" }
  | { kind: "no-active-invoices" }
  | { kind: "editable"; requiresPrintedAck: boolean; downstreamReferences: Array<"tax-invoice" | "billing-note"> };

export function checkOrderEditable(params: {
  orderStatus: string;
  invoiceStatuses: string[];
  invoicesWithBillingNote: number;
  hasActiveTaxInvoiceReference: boolean;
}): OrderEditGuardResult {
  if (params.orderStatus !== "CONFIRMED") return { kind: "not-applicable" };

  const activeStatuses = params.invoiceStatuses.filter((s) => s !== "CANCELLED");
  if (activeStatuses.length === 0) return { kind: "no-active-invoices" };

  const downstreamReferences: Array<"tax-invoice" | "billing-note"> = [];
  if (params.invoicesWithBillingNote > 0) downstreamReferences.push("billing-note");
  if (params.hasActiveTaxInvoiceReference) downstreamReferences.push("tax-invoice");

  const requiresPrintedAck = activeStatuses.some((s) => s === "PRINTED");
  return { kind: "editable", requiresPrintedAck, downstreamReferences };
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
