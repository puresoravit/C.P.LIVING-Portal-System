import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Production Module (P1) — "สั่งครั้งที่ N" นับ per branch แบบไม่รีเซ็ต (ยืนยันแล้วใน
// docs/production-module/02-P1-schema-decisions.md) — ใช้ Pattern Atomic Upsert เดียวกับ
// getNextSkuSeq ทุกประการ (Postgres แปลเป็น INSERT ... ON CONFLICT DO UPDATE กัน Race
// Condition จริง ไม่ใช่การ Query MAX(seq)+1)
export async function getNextBranchOrderSeq(
  branchId: string,
  client: Prisma.TransactionClient | typeof db = db
): Promise<number> {
  const seq = await client.branchOrderSequence.upsert({
    where: { branchId },
    create: { branchId, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  return seq.lastSeq;
}
