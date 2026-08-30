"use client";

import { BackLink } from "@/components/production/back-link";

// CP2 — ปุ่มพิมพ์ใบขึ้นของ: window.print() ล้วนๆ ไม่แตะ state ใดๆ (พิมพ์ ≠ ยืนยันขึ้นของ —
// การยืนยันอยู่ที่หน้า "ยืนยันขึ้นของจริง" ซึ่งต้องนับยอด+แนบรูปเท่านั้น)
export function LoadingSheetControls({ backHref }: { backHref: string }) {
  return (
    <div className="print:hidden flex flex-wrap items-center gap-2 mb-3 sticky top-0 bg-gray-50 py-2 z-10">
      <button
        onClick={() => window.print()}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
      >
        พิมพ์ใบขึ้นของ (A4 แนวนอน)
      </button>
      <span className="text-xs text-gray-500">การพิมพ์ไม่ใช่การยืนยันขึ้นของ — ยืนยันได้ที่หน้าเที่ยวรถหลังนับยอดจริง</span>
      <BackLink fallbackHref={backHref} label="← ย้อนกลับ" className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap" />
    </div>
  );
}
