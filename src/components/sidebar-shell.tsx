"use client";

import { useState } from "react";
import { CPIcon } from "@/components/portal/cp-brand";

// Phase Nav-1 — Sidebar เดิมเป็น <aside> กว้างคงที่ที่แสดงตลอดเวลา ไม่รองรับจอเล็ก
// เพราะเมนูตอนนั้นสั้น (Flat List) แต่ตอนนี้เมนูมี Group/Submenu ลึกขึ้น จึงต้องมี
// Hamburger Toggle สำหรับ Mobile — Desktop ยังคงแสดง Sidebar ตลอดเวลาเหมือนเดิม
export function SidebarShell({ brand, userInfo, children }: { brand: string; userInfo: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b print:hidden sticky top-0 z-30">
        <div className="flex items-center gap-1.5">
          <CPIcon height={18} />
          <span className="font-semibold">{brand}</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนู"
          className="p-2 -mr-2 text-gray-600 hover:text-gray-900"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {open && <div className="md:hidden fixed inset-0 bg-black/40 z-40 print:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`w-64 md:w-56 bg-white border-r flex flex-col print:hidden fixed md:static inset-y-0 left-0 z-50 transform transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 py-4 border-b flex items-start justify-between">
          <div className="min-w-0">
            {/* Owner UAT — Master Logo (ตัวสัญลักษณ์เท่านั้น ผ่าน CPIcon — ดู cp-brand.tsx)
                วางหน้าชื่อระบบ เล็ก/กระชับ ไม่แย่งเด่นจากข้อความ — items-center ให้กึ่งกลาง
                แนวตั้งพอดีกับความสูงบรรทัดข้อความ ไม่ดัน Header สูงขึ้นเห็นได้ชัด */}
            <div className="flex items-center gap-1.5">
              <CPIcon height={18} />
              <span className="font-semibold truncate">{brand}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{userInfo}</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="ปิดเมนู"
            className="md:hidden text-gray-400 hover:text-gray-700 text-xl leading-none -mt-1"
          >
            ×
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
