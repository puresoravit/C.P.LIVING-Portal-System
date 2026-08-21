import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// R4 — SKU Auto-generate: แยกจาก DocumentSequence เด็ดขาด (ดู comment บน
// ProductSkuSequence ใน schema.prisma) เพราะ SKU เป็น Product Identity ถาวร ห้าม Reset
// ตามเดือนเหมือนเลขเอกสาร — ใช้ Pattern Atomic Upsert เดียวกับ getNextSeq ทุกประการ
// (Postgres แปลเป็น INSERT ... ON CONFLICT DO UPDATE กัน Race Condition จริง ไม่ใช่การ
// Query MAX(seq)+1 ที่ race กันได้ตามที่ Comment ของ DocumentSequence เตือนไว้)
const SKU_SEQUENCE_ID = 1;

export async function getNextSkuSeq(client: Prisma.TransactionClient | typeof db = db): Promise<number> {
  const seq = await client.productSkuSequence.upsert({
    where: { id: SKU_SEQUENCE_ID },
    create: { id: SKU_SEQUENCE_ID, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  return seq.lastSeq;
}

export function formatAutoSku(seq: number): string {
  return `AUTO-${String(seq).padStart(6, "0")}`;
}

/** เรียกรวม: ขอเลขถัดไป + Format เป็น SKU พร้อมใช้ — ใช้ตอน Create Product ที่เว้น SKU ว่างไว้ */
export async function generateNextSku(client: Prisma.TransactionClient | typeof db = db): Promise<string> {
  const seq = await getNextSkuSeq(client);
  return formatAutoSku(seq);
}
