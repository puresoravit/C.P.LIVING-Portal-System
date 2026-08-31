import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ==========================================================================
// RUNNING NUMBER (ข้อ 30, 52)
// ใช้ Prisma upsert ซึ่ง Postgres แปลเป็น INSERT ... ON CONFLICT DO UPDATE
// เป็น atomic operation ระดับ row lock จริง — ป้องกันเลขซ้ำแม้มีคนออก
// เอกสารพร้อมกันหลายคน (ต่างจากการ query MAX(number)+1 ที่ race กันได้)
// รีเซ็ตทุกเดือน (period = YYYYMM) ตามที่ยืนยันไว้
// ==========================================================================

export function currentPeriod(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

/**
 * ดึงเลขรันถัดไปของ docType+period นี้ (เริ่มที่ 1)
 * ส่ง tx (Prisma Transaction Client) เข้ามาถ้าต้องการรวมกับ transaction อื่น
 * เพื่อ rollback พร้อมกันได้ (ข้อ 56 Error Handling — atomic)
 */
export async function getNextSeq(
  docType: string,
  period: string,
  tx: Prisma.TransactionClient | typeof db = db
): Promise<number> {
  const seq = await tx.documentSequence.upsert({
    where: { docType_period: { docType, period } },
    create: { docType, period, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  return seq.lastSeq;
}

export function formatDocNumber(docType: string, period: string, seq: number, digits = 5): string {
  return `${docType}-${period}-${String(seq).padStart(digits, "0")}`;
}

// Owner UAT Fix Batch — ข้อ 3 (Quotation Revision UX): "Rev. N" สื่อความหมายกำกวมกับ
// Owner (เอกสารกระดาษคนละใบ แต่เลขที่เหมือนกันเป๊ะ ต่างกันแค่ Label เล็กๆ ข้างเลข) —
// Audit แล้วพบว่า Quotation.revisionNo เป็นแค่ Counter เพิ่มใน Row เดิม (ไม่มี Table
// History แยก, ไม่มี Unique Constraint ผูกกับมันเลย, Quotation.quotationNumber เดิมยัง
// @unique เดี่ยวๆ) จึงปลอดภัย 100% ที่จะ "แปะ Suffix ต่อท้ายเฉพาะตอนแสดงผล/พิมพ์" แทนการ
// โชว์ "Rev. N": ไม่มีการเปลี่ยน Schema/Data ใดๆ เลย, Running Number Sequence เดิมของ
// เดือนนั้นไม่ขยับ, AuditLog เดิม (บันทึก Before/After ทุกครั้งที่แก้ไข Confirmed
// Quotation อยู่แล้ว) ไม่ถูกแตะ, ไม่มีความเสี่ยงเลขซ้ำเพราะ Suffix นี้ไม่เคยถูก Query/
// Unique-check ใดๆ เป็นแค่ String ที่คำนวณตอนแสดงผลเท่านั้น — Quotation ฉบับแรก
// (revisionNo=0) แสดงเลขปกติเป๊ะ ไม่มี Suffix เลย ฉบับที่แก้ไขแล้ว (revisionNo>=1) จะได้
// "-N" ต่อท้าย ให้แยกออกจากฉบับแรกได้ชัดเจนบนกระดาษจริง
export function displayQuotationNumber(quotationNumber: string, revisionNo: number): string {
  return revisionNo > 0 ? `${quotationNumber}-${revisionNo}` : quotationNumber;
}
