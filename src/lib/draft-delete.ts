import type { Prisma } from "@prisma/client";
import { parseDocNumber, tryReleaseSeq } from "@/lib/running-number-reclaim";

// ==========================================================================
// Owner (2026-09-02) — "ลบร่าง": เอกสารที่ยังเป็น DRAFT และไม่เคย Confirm ไม่ถือเป็น
// Historical Business Document — ลบจริง (Hard Delete) ทั้งใบ+รายการลูก ไม่สร้างสถานะ
// CANCELLED ไม่โผล่ใน Documents/แท็บยกเลิกอีกเลย — ใช้ได้เฉพาะ 2 ประเภทที่ Audit แล้วว่า
// มี DRAFT Lifecycle จริง: Order และ Quotation (Invoice เกิดเป็น CONFIRMED เสมอ /
// TaxInvoice/BillingNote/RepairNote ไม่มีสถานะ DRAFT เลย)
//
// เลขเอกสาร: Reuse กลไก Reclaim เดิมทั้งชุด (parseDocNumber + tryReleaseSeq CAS) — เลข
// ล่าสุดของ Sequence คืนได้จริง (เอกสารใหม่ได้เลขเดิมต่อ) / เลขกลางคืนไม่ได้ กลายเป็นช่อง
// ว่างถาวรโดยไม่มี Active Conflict (แถวถูกลบไปแล้ว Partial Unique Index ไม่มีอะไรชน)
//
// เอกสารที่ CONFIRMED แล้ว: ยังใช้ Cancel Flow เดิมทุกประการ (เก็บประวัติ ห้ามลบ) — Core
// นี้ CAS-Delete เฉพาะแถวที่ยังเป็น DRAFT อยู่จริงเท่านั้น กันชนกับ Confirm ที่วิ่งพร้อมกัน
// ==========================================================================

export const DRAFT_DELETE_CHANGED = "DRAFT_STATUS_CHANGED";
export const DRAFT_DELETE_BLOCKED = "DRAFT_HAS_DEPENDENCY";

/** ลบร่าง Order (เรียกภายใน Transaction) — คืน { released } ว่าเลขถูก Reclaim สำเร็จไหม
 * Throw DRAFT_DELETE_CHANGED เมื่อสถานะเปลี่ยนไปแล้วระหว่างทำ (เช่นเพิ่ง Confirm) /
 * DRAFT_DELETE_BLOCKED เมื่อร่างมี Dependency ผิดปกติ (Invoice ผูกอยู่ — ร่างปกติไม่มีทางมี) */
export async function deleteDraftOrderCore(
  tx: Prisma.TransactionClient,
  order: { id: string; orderNumber: string },
  userId: string
): Promise<{ released: boolean }> {
  // Guard Dependency ใน Transaction (Defense-in-depth ซ้ำจากชั้น Action): ร่างปกติไม่มี
  // Invoice (เกิดตอน Confirm เท่านั้น) — เจอ = ข้อมูลผิดปกติ ห้ามลบเด็ดขาด
  const invoiceCount = await tx.invoice.count({ where: { parentOrderId: order.id } });
  if (invoiceCount > 0) throw new Error(DRAFT_DELETE_BLOCKED);

  // Reclaim เลขตามกติกาเดิม (สำเร็จเฉพาะเลขท้าย Sequence — CAS) — อยู่ใน Transaction
  // เดียวกับการลบ: ลบไม่สำเร็จ = Rollback การคืนเลขด้วยอัตโนมัติ
  const parsed = parseDocNumber("ORDER", order.orderNumber);
  const released = parsed ? await tryReleaseSeq("ORDER", parsed.period, parsed.seq, tx) : false;

  await tx.orderItem.deleteMany({ where: { orderId: order.id } });
  // CAS-Delete: ลบเฉพาะเมื่อยังเป็น DRAFT อยู่จริง (กัน Confirm แทรกกลาง — Pattern C1/C2)
  const del = await tx.order.deleteMany({ where: { id: order.id, status: "DRAFT" } });
  if (del.count !== 1) throw new Error(DRAFT_DELETE_CHANGED);

  // Audit Event: ใครลบร่าง/เมื่อไร (recordId ชี้ id ที่ถูกลบ — AuditLog ไม่ผูก FK กับ
  // เอกสาร จึงไม่ทำให้ร่างที่ลบกลับมาโผล่ใน Documents/แท็บยกเลิกใดๆ)
  await tx.auditLog.create({
    data: {
      userId,
      action: "DELETE_DRAFT",
      module: "Order",
      recordId: order.id,
      oldValue: { orderNumber: order.orderNumber, status: "DRAFT" },
      newValue: { deleted: true, numberReleased: released },
    },
  });
  return { released };
}

/** ลบร่าง Quotation — กติกาเดียวกับ Order ทุกประการ (Quotation ไม่มี Downstream Document
 * ใดๆ อยู่แล้วโดยสถาปัตยกรรม — Guard เหลือแค่ CAS สถานะ DRAFT) — ร่าง Guest ที่ผูก
 * Prospect: ลบเฉพาะใบ Prospect ยังอยู่ (เป็นสมุดรายลูกค้า ไม่ใช่ของของใบนี้) */
export async function deleteDraftQuotationCore(
  tx: Prisma.TransactionClient,
  quotation: { id: string; quotationNumber: string },
  userId: string
): Promise<{ released: boolean }> {
  const parsed = parseDocNumber("QT", quotation.quotationNumber);
  const released = parsed ? await tryReleaseSeq("QT", parsed.period, parsed.seq, tx) : false;

  await tx.quotationItem.deleteMany({ where: { quotationId: quotation.id } });
  const del = await tx.quotation.deleteMany({ where: { id: quotation.id, status: "DRAFT" } });
  if (del.count !== 1) throw new Error(DRAFT_DELETE_CHANGED);

  await tx.auditLog.create({
    data: {
      userId,
      action: "DELETE_DRAFT",
      module: "Quotation",
      recordId: quotation.id,
      oldValue: { quotationNumber: quotation.quotationNumber, status: "DRAFT" },
      newValue: { deleted: true, numberReleased: released },
    },
  });
  return { released };
}
