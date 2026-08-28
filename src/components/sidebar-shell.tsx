"use client";

import { useEffect, useRef, useState } from "react";
import { CPIcon } from "@/components/portal/cp-brand";

// Owner UAT (2026-08-28) — ปัดนิ้วจากขอบซ้ายสุดของจอไปทางขวาให้เปิดเมนูได้เหมือนท่ามาตรฐาน
// ของแอพมือถือ (iOS edge-swipe) — จับด้วย document-level touch listener (ทำงานได้จาก
// ทุกหน้า ไม่ใช่แค่แถบหัว) ปัดต้องเริ่ม "จากขอบจริงๆ" (EDGE_ZONE_PX) กันชนกับการเลื่อน
// แนวนอนของตารางที่มี overflow-x-auto อยู่กลางหน้า — Listener เป็น passive (ไม่เรียก
// preventDefault) จึงไม่กระทบการ Scroll ปกติของหน้าเลยแม้แต่นิดเดียว แค่ "แอบดู" ทิศทาง
// การปัดเพื่อ setOpen(true) — Animation ที่ตามมาใช้ transition เดิมของ <aside> ทั้งหมด
const EDGE_ZONE_PX = 24;
const SWIPE_THRESHOLD_PX = 60;

// Phase Nav-1 — Sidebar เดิมเป็น <aside> กว้างคงที่ที่แสดงตลอดเวลา ไม่รองรับจอเล็ก
// เพราะเมนูตอนนั้นสั้น (Flat List) แต่ตอนนี้เมนูมี Group/Submenu ลึกขึ้น จึงต้องมี
// Hamburger Toggle สำหรับ Mobile — Desktop ยังคงแสดง Sidebar ตลอดเวลาเหมือนเดิม
//
// Owner UAT — Billing UI Visual Polish R3 (2026-08-24): R2 ยังตีความ "Sidebar เชื่อม
// กับ Content" ผิดจุด — แก้แค่ Active Pill ไม่พอ Owner สั่งชัดว่าต้องการ "มวลสีของ
// Sidebar" ที่เป็น Design Surface จริง (ดู Reference: พื้นสีเข้มเต็มแถบ ไม่ใช่ Sidebar
// ขาว+จุดสีเล็กๆ) — เปลี่ยน <aside> จาก bg-white → Gradient แนวตั้ง cp-navy→cp-navy-
// deep (ค่าเดียวกับ CP_NAVY/CP_NAVY_DEEP ที่ Splash Screen ใช้อยู่แล้ว — Reuse Brand
// ไม่ใช่คิดสีใหม่) ทำให้ Sidebar เป็นพื้นที่สีหลักที่มองเห็นชัดทันที เหมือน Reference แต่
// เป็นโทน Navy ของ C.P. LIVING เอง — "รอยต่อ" กับ Content ตอนนี้เกิดจาก 2 อย่างรวมกัน:
// (1) พื้นที่สีสองก้อนวางชิดกัน (Navy/Cream) อ่านเป็น Composition เดียวตั้งแต่มองครั้งแรก
// (2) มุมโค้งของ Content (md:rounded-tl ใน layout.tsx) "แหว่ง" เข้ามาเห็นพื้น Navy
// โผล่ออกมาตรง Corner — เกิด Notch จริงแบบ Reference โดยไม่ต้องวาด SVG Curve เพิ่ม
//
// Mobile Top Bar (แถบ Hamburger บนสุดที่เห็นตลอดก่อนกด "เปิดเมนู") **ตั้งใจคงเป็นสีขาว
// เดิม ไม่แปลงเป็น Navy** — แถบนี้เป็น "Page Header" ของทั้งแอพ ไม่ใช่ตัว Sidebar เอง
// (Sidebar ตัวจริงคือ Drawer navy ที่โผล่มาหลังกดเปิด) แยก Concept กันชัดเจน ลดความ
// เสี่ยง (ไม่ต้องหา Logo/Icon สีขาวสำรองสำหรับพื้นที่ที่เห็นตลอดเวลาโดยไม่จำเป็น)
export function SidebarShell({ brand, userInfo, children }: { brand: string; userInfo: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (openRef.current) return; // เปิดอยู่แล้ว ไม่ต้องจับปัด
      const t = e.touches[0];
      touchStart.current = t.clientX <= EDGE_ZONE_PX ? { x: t.clientX, y: t.clientY } : null;
    }
    function onTouchMove(e: TouchEvent) {
      if (!touchStart.current) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.current.x;
      const dy = t.clientY - touchStart.current.y;
      // ต้องปัดแนวนอนชัดเจน (dx เยอะกว่า dy) กันชนกับ Scroll แนวตั้งของหน้า
      if (dx > SWIPE_THRESHOLD_PX && dx > Math.abs(dy) * 1.5) {
        setOpen(true);
        touchStart.current = null;
      }
    }
    function onTouchEnd() {
      touchStart.current = null;
    }
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return (
    <>
      {/* Owner UAT (2026-08-28) — ย้ายปุ่มเปิดเมนู (สามขีด) จากขวาไปซ้ายสุด — เลิกใช้
          justify-between (เดิมตรึงโลโก้ซ้าย/ปุ่มขวาคนละหัวท้าย) เปลี่ยนเป็นเรียงชิดซ้าย
          ด้วยกันทั้งคู่ (ปุ่มก่อน โลโก้ตามหลัง) ตาม Pattern เมนูมือถือทั่วไป */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b print:hidden sticky top-0 z-30">
        <button
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนู"
          className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {/* Owner UAT — Logo ขยายเป็น 24px (18→21→24 ตามลำดับ Feedback) แล้วขยับขึ้นเล็กน้อย
            (-mt-[1.5px]) ให้จุดกึ่งกลางแนวตั้งของ Logo สองบรรทัด (สัญลักษณ์+C.P.) ตรงกับ
            กึ่งกลางบรรทัดข้อความแบบ Optical (ไม่ใช่ Mathematical Center ของ items-center
            เฉยๆ ซึ่งดูต่ำไปนิด) */}
        <div className="flex items-center gap-1.5">
          <CPIcon height={24} className="-mt-[1.5px]" />
          <span className="font-semibold">{brand}</span>
        </div>
      </div>

      {open && <div className="md:hidden fixed inset-0 bg-black/40 z-40 print:hidden" onClick={() => setOpen(false)} />}

      {/* Production Prep — Sliding Indicator Fix: id นี้ถูกอ้างโดย <link rel="expect"
          blocking="render"> ใน (dashboard)/layout.tsx — บังคับให้เบราว์เซอร์รอ Parse
          จนจบ </aside> (= Active Tab อยู่ใน DOM แน่นอน) ก่อนวาดเฟรมแรกของหน้าใหม่ —
          ปิด Race ที่ทำให้ Cross-document View Transition "บางครั้ง" Capture ไม่เจอ
          Active Tab ของหน้าใหม่ (HTML มาเป็นช่วงๆ ตามจังหวะเครือข่าย) แล้วเห็นเป็น
          กะพริบแทนการไหล — Sidebar อยู่ต้น Body ดีเลย์ที่เพิ่มจึงแทบเป็นศูนย์ */}
      <aside
        id="cp-sidebar"
        className={`w-64 md:w-56 bg-gradient-to-b from-cp-navy to-cp-navy-deep flex flex-col print:hidden fixed md:static inset-y-0 left-0 z-50 shadow-2xl md:shadow-none transform transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 py-4 border-b border-white/10 flex items-start justify-between">
          <div className="min-w-0">
            {/* Owner UAT — Master Logo (สัญลักษณ์+C.P. ผ่าน CPIcon — ดู cp-brand.tsx) วางหน้า
                ชื่อระบบ — ขยายเป็น 24px (18→21→24 ตามลำดับ Feedback) แล้วขยับขึ้นเล็กน้อย
                (-mt-[1.5px]) ให้กึ่งกลางแนวตั้งของ Logo 2 บรรทัดตรงกับกึ่งกลางบรรทัดข้อความ
                แบบ Optical — ไม่ดัน Header สูงขึ้นเห็นได้ชัด — Logo Asset เดิมออกแบบให้ใช้
                บนพื้น Navy อยู่แล้ว (Splash/Login ใช้พื้นเดียวกันนี้) จึงไม่ต้องแก้ไฟล์ */}
            <div className="flex items-center gap-1.5">
              <CPIcon height={24} className="-mt-[1.5px]" />
              <span className="font-semibold truncate text-white">{brand}</span>
            </div>
            <div className="text-xs text-white/50 mt-0.5">{userInfo}</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="ปิดเมนู"
            className="md:hidden text-white/40 hover:text-white text-xl leading-none -mt-1"
          >
            ×
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
