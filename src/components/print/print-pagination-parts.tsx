// R8 (2026-08-26) — ชิ้นส่วนร่วมของ Document Pagination (ดูสถาปัตยกรรมเต็มใน
// src/lib/print-pagination.ts) — Shared ให้ Body Component ทุกประเภทเอกสารใช้ Shape/
// ป้ายเลขหน้าตรงกันเป๊ะ

/** Prop `pagination` ที่หน้า Print จริงส่งให้ Body — ไม่ส่ง = Body เรนเดอร์โครงเดิม
 * ทุกประการ (เส้นทางของ Designer/Sample Data ไม่แตะเลย) */
export type PrintBodyPagination<TItem, TSummary> = {
  pages: {
    items: TItem[];
    summary: TSummary;
    /** Owner Approve (2026-09-02) — Physical Sheet: Header เฉพาะหน้านี้ (เลขที่เอกสาร
     * เป็นเลขแผ่นของตัวเอง) — ไม่ส่ง = ใช้ `header` กลางเหมือนเดิมทุกประการ */
    header?: React.ReactNode;
    /** ป้ายเลขหน้า Override (ใช้ตอนพิมพ์เฉพาะแผ่น — ให้ "หน้า 2/3" ตรงตำแหน่งจริงของ
     * แผ่นในชุด ไม่ใช่ 1/1) — ไม่ส่ง = idx+1 / pages.length ตามเดิม */
    label?: { pageNo: number; pageCount: number };
    /** บทบาทหน้านี้ตอนพิมพ์เฉพาะแผ่น: Full Footer เฉพาะแผ่นจบจริงของชุด (ไม่ใช่หน้า
     * สุดท้ายของ "สิ่งที่กำลังพิมพ์") — ไม่ส่ง = idx === last ตามเดิม */
    isFinalSheet?: boolean;
    /** โชว์กล่อง "รวมหน้านี้" ไหม (ชุดหลายแผ่นต้องโชว์เสมอแม้พิมพ์แผ่นเดียว) —
     * ไม่ส่ง = pages.length > 1 ตามเดิม */
    showPageSummary?: boolean;
    /** เลขลำดับบรรทัดแรกของหน้านี้ (0-based) — พิมพ์เฉพาะแผ่นกลางต้องต่อเลขจริง
     * ของเอกสาร ไม่ใช่เริ่ม 1 ใหม่ — ไม่ส่ง = นับสะสมจากหน้าก่อนตามเดิม */
    startIndex?: number;
  }[];
  /** Header เต็ม (HeaderZone/Classic Blocks จากหน้า Print) — เรนเดอร์ซ้ำทุกหน้า */
  header: React.ReactNode;
  /** Signature Block — เรนเดอร์ทุก Physical Sheet (Owner 2026-09-02) */
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
