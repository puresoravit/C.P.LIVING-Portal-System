// รวมผลลัพธ์จาก Prisma groupBy(status) เข้ากับชุด Tab Key ที่หน้านั้นต้องแสดง — Status
// ที่ยังไม่มีข้อมูล (เช่น ยังไม่มี Order ร่างเลย) จะได้ 0 แทนที่จะหายไปจากรายการ
export function buildStatusTabCounts(
  statusGroups: { status: string; count: number }[],
  tabKeys: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of tabKeys) counts[key] = 0;
  for (const g of statusGroups) {
    if (g.status in counts) counts[g.status] = g.count;
  }
  return counts;
}
