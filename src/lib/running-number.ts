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
