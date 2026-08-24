// Pagination — Shared UI แทนที่ take:100 เดิม (ที่ตัดรายการเงียบๆ โดยผู้ใช้ไม่รู้ตัว)
// ด้วยการแบ่งหน้าจริงพร้อมบอกจำนวนหน้าทั้งหมด — ก่อนหน้า/ถัดไป แบบ Link ธรรมดา
// (ไม่มี Client JS) สอดคล้องกับ Pattern ที่ใช้อยู่แล้วทั้งระบบ (StatusTabs, GROUP_TABS)
export function Pagination({
  page,
  totalPages,
  totalCount,
  basePath,
  preserveParams,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  basePath: string;
  preserveParams: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(p: number) {
    return `${basePath}?${new URLSearchParams({ ...preserveParams, page: String(p) }).toString()}`;
  }

  return (
    <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
      <span>
        หน้า {page} / {totalPages} (ทั้งหมด {totalCount.toLocaleString("th-TH")} รายการ)
      </span>
      <div className="flex gap-1">
        <a
          href={hrefFor(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={`px-3 py-1.5 border rounded-lg transition-colors duration-150 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-gray-50 hover:border-cp-navy/30"}`}
        >
          ก่อนหน้า
        </a>
        <a
          href={hrefFor(Math.min(totalPages, page + 1))}
          aria-disabled={page >= totalPages}
          className={`px-3 py-1.5 border rounded-lg transition-colors duration-150 ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-gray-50 hover:border-cp-navy/30"}`}
        >
          ถัดไป
        </a>
      </div>
    </div>
  );
}
