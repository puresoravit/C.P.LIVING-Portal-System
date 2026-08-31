import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ==========================================================================
// DOCUMENT NUMBER RECLAIM — Owner UAT (2026-08-31)
//
// รอบแรก (bbdcc54, reverted เป็น b78535f) ลองแค่ "ลด lastSeq" เฉยๆ แล้วทำให้เอกสารถัดไป
// พยายามใช้เลขเดียวกับแถวที่ถูกยกเลิก — พังทันทีทุกครั้งไม่มีข้อยกเว้น เพราะ Cancel เป็น
// Soft-delete (แถวเดิมไม่เคยถูกลบ) เลขที่เดิมยังครองอยู่ในคอลัมน์ @unique ตลอดไป ชนกับ
// ความพยายาม Reuse เสมอ — ดู Incident Post-mortem ใน commit message ของ b78535f
//
// รอบนี้แก้ที่ระดับ Constraint แทน: orderNumber/invoiceNumber/taxInvoiceNumber/
// billingNoteNumber/quotationNumber/noteNumber เปลี่ยนจาก @unique ธรรมดา เป็น Postgres
// Partial Unique Index (`WHERE NOT "numberReleased"` — ดู migration
// 20260831131508_document_number_partial_unique_reclaim) แถวที่ถูกยกเลิก+ปล่อยเลขคืนแล้ว
// (numberReleased=true) จะไม่ถูกนับในเงื่อนไข Unique อีกต่อไป เอกสารใหม่จึงใช้เลขเดียวกัน
// ได้จริงโดยไม่ชนกัน — **เลขที่ในคอลัมน์ของแถวเก่าไม่เคยถูกแก้ไข/เปลี่ยนชื่อเลย** (Owner
// ระบุตรงๆ ว่าไม่ต้องการเห็นเลขที่แปลกๆ อย่าง VOID-xxxxx ในหน้าหลัก) ยังแสดงเลขเดิมเป๊ะ
// พร้อม Badge "คืนเลขแล้ว" จาก numberReleased=true — ไม่ต้องแก้จุดแสดงผลเลขที่เอกสารที่ไหน
// เลยทั่วระบบ (Audit 2026-08-31 ยืนยันแล้วว่าไม่มีจุดไหน findUnique/findFirst คีย์ด้วยเลข
// ที่เอกสารเลย ทุกจุด Resolve ด้วย id เสมอ — ดู Audit Report ก่อน Implement รอบนี้)
//
// เงื่อนไข Reclaim (Owner ยืนยันตรงๆ 2026-08-31):
//   1. ต้องเป็นเลขล่าสุดของ docType+period นั้น (CAS ผ่าน documentSequence.lastSeq)
//   2. ไม่มี Downstream Document อ้างอิงอยู่ (เช่น Invoice ที่มี TaxInvoice/BillingNote)
//   3. Invoice/TaxInvoice/BillingNote — ต้องไม่เคย PRINTED (printedAt ยัง null)
//   4. Order/Quotation/RepairReturnNote — ต้องไม่เคย CONFIRMED (Confirmed เองคือ Checkpoint
//      เพราะ 3 ประเภทนี้ไม่มี PRINTED Checkpoint ของตัวเอง)
// ==========================================================================

/**
 * แยก period/seq กลับจากเลขที่เอกสารที่ formatDocNumber ผลิตออกมา — ใช้ "อ่านเพื่อเทียบ"
 * กับ documentSequence.lastSeq เท่านั้น (ตรวจว่ายังเป็นเลขล่าสุดอยู่จริงไหม) **ไม่เคยใช้
 * เขียนกลับหรือสร้างเลขที่ใหม่จากค่านี้เลย** — ตัด prefix `${docType}-` ออกก่อนแล้วค่อยหา
 * "-" ตัวสุดท้ายที่เหลือ (กัน docType ที่มี "-" ปนอยู่เอง เช่น "INV-A" ทำให้ parse period ผิด)
 * คืน null ถ้ารูปแบบไม่ตรง docType ที่ให้มา
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
 * ลด lastSeq ลง 1 ก็ต่อเมื่อยังเท่ากับ seq ที่ส่งมาจริง (CAS แบบเดียวกับ getNextSeq เป๊ะ —
 * Row-level Lock จริงผ่าน UPDATE เดี่ยว) — ถ้ามีคนออกเลขถัดไปไปแล้วหลังจากนี้ (lastSeq ขยับ
 * ไปแล้ว) จะคืน false ทันทีโดยไม่ทำอะไรเลย (ไม่ Retry เอง) — Caller ต้อง Treat false เป็น
 * "ยกเลิก Reclaim รอบนี้" ไม่ใช่พยายามใหม่ ไม่งั้นเสี่ยง Reclaim เลขที่ไม่ใช่ล่าสุดจริงแล้ว
 * (ดู Concurrency Audit 2026-08-31 — ส่วนนี้คือกลไกเดียวที่ป้องกัน Race กับคนออกเลขใหม่
 * พร้อมกันได้จริง)
 */
export async function tryReleaseSeq(
  docType: string,
  period: string,
  seq: number,
  tx: Prisma.TransactionClient | typeof db = db
): Promise<boolean> {
  const result = await tx.documentSequence.updateMany({
    where: { docType, period, lastSeq: seq },
    data: { lastSeq: { decrement: 1 } },
  });
  return result.count > 0;
}
