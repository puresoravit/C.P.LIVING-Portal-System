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

/**
 * แยก period/seq กลับจากเลขที่เอกสารที่ formatDocNumber ผลิตออกมา — ตัด prefix
 * `${docType}-` ออกก่อนแล้วค่อยหา "-" ตัวสุดท้ายที่เหลือ (กัน docType ที่มี "-" ปนอยู่เอง
 * เช่น "INV-A" ไม่ทำให้ parse period ผิด) คืน null ถ้ารูปแบบไม่ตรง docType ที่ให้มา
 */
export function parseDocNumber(docType: string, formatted: string): { period: string; seq: number } | null {
  const prefix = `${docType}-`;
  if (!formatted.startsWith(prefix)) return null;
  const rest = formatted.slice(prefix.length);
  const lastDash = rest.lastIndexOf("-");
  if (lastDash === -1) return null;
  const period = rest.slice(0, lastDash);
  const seq = Number(rest.slice(lastDash + 1));
  if (!Number.isFinite(seq)) return null;
  return { period, seq };
}

/**
 * Owner UAT (2026-08-31) — ยกเลิกเอกสารแล้วเลขที่หายไปเฉยๆ (Gap) ทำให้ดูเหมือนเลขกระโดด
 * Owner ต้องการดึงเลขกลับมาใช้ต่อ แต่เฉพาะกรณี "ยกเลิกใบล่าสุด" เท่านั้น — เพราะการยกเลิก
 * ไม่มีเงื่อนไขบังคับว่าต้องเป็นใบล่าสุดเสมอ (ยกเลิกใบเก่าขณะมีใบใหม่กว่า Active อยู่ได้)
 * ถ้าดึงคืนแบบไม่มีเงื่อนไขจะทำให้ใบที่สร้างทีหลังมีเลขน้อยกว่าใบที่สร้างก่อนหน้า (ลำดับ
 * เลขไม่ตรงลำดับเวลาสร้างอีกต่อไป เสี่ยงสับสนตอนไล่เอกสารย้อนหลัง) — เช็คผ่าน CAS แบบ
 * เดียวกับ getNextSeq เป๊ะ: ลด lastSeq ก็ต่อเมื่อยังเท่ากับ seq ของใบที่กำลังยกเลิกอยู่จริง
 * (แปลว่ายังไม่มีใครออกเลขถัดไปอีกหลังจากนี้) ถ้าไม่ตรง (มีใบใหม่กว่าออกไปแล้ว) จะไม่ทำ
 * อะไรเลย เลขเก่ายัง "เผา" ทิ้งเหมือนพฤติกรรมเดิม — ใช้ร่วมกันได้ทุกประเภทเอกสาร
 */
export async function releaseSeqIfLatest(
  docType: string,
  formattedNumber: string,
  tx: Prisma.TransactionClient | typeof db = db
): Promise<boolean> {
  const parsed = parseDocNumber(docType, formattedNumber);
  if (!parsed) return false;
  const result = await tx.documentSequence.updateMany({
    where: { docType, period: parsed.period, lastSeq: parsed.seq },
    data: { lastSeq: { decrement: 1 } },
  });
  return result.count > 0;
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
