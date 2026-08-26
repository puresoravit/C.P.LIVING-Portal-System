// R8 (2026-08-26) — ชิ้นส่วนร่วมของ Document Pagination (ดูสถาปัตยกรรมเต็มใน
// src/lib/print-pagination.ts) — Shared ให้ Body Component ทุกประเภทเอกสารใช้ Shape/
// ป้ายเลขหน้าตรงกันเป๊ะ

/** Prop `pagination` ที่หน้า Print จริงส่งให้ Body — ไม่ส่ง = Body เรนเดอร์โครงเดิม
 * ทุกประการ (เส้นทางของ Designer/Sample Data ไม่แตะเลย) */
export type PrintBodyPagination<TItem, TSummary> = {
  pages: { items: TItem[]; summary: TSummary }[];
  /** Header เต็ม (HeaderZone/Classic Blocks จากหน้า Print) — เรนเดอร์ซ้ำทุกหน้า */
  header: React.ReactNode;
  /** Signature Block — เรนเดอร์เฉพาะหน้าสุดท้าย */
  signature?: React.ReactNode;
};

/** ป้าย "หน้า X/Y" มุมขวาเหนือตาราง — แสดงเฉพาะเอกสารหลายหน้า */
export function PrintPageLabel({ pageNo, pageCount }: { pageNo: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  return (
    <div className="text-right text-[10px] text-gray-500 mb-0.5">
      หน้า {pageNo} / {pageCount}
    </div>
  );
}
