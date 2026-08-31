import { db } from "@/lib/db";

// Owner UAT (2026-08-29) — ใช้ร่วมกันทั้ง Badge บน Sidebar (layout.tsx) และหน้ารายการ
// ค้างส่งเอง กันเขียน Query ซ้ำ 2 ที่
export async function getUnresolvedPendingRedeliveryCount(): Promise<number> {
  return db.invoicePendingRedelivery.count({ where: { resolvedAt: null } });
}
