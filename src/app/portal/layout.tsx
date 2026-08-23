import { InactivityLogout } from "@/components/portal/inactivity-logout";
import { MOTION_EASE, MOTION_PAGE_MS } from "@/components/portal/cp-brand";

// R6 Phase F — Layout ของ Portal Segment:
// - Inactivity Auto-Logout ครอบทุกหน้าใต้ /portal (แอพ Billing มีตัวเดียวกันใน
//   (dashboard)/layout.tsx — Timestamp ใช้ Key ร่วมกันใน localStorage นับต่อเนื่อง
//   ข้ามแอพ/ข้าม Tab)
// - Owner UAT Polish: Motion System กลางของ Segment นี้ — หน้า Portal/Access Fade เข้า
//   นุ่มๆ ด้วยจังหวะ/Easing เดียวกับ Splash/Login (MOTION_EASE) — Scoped เฉพาะ Segment
//   /portal เท่านั้น ไม่มีทาง Leak เข้าแอพ Billing/หน้า Print (คนละ Route Segment)
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @keyframes cpfPageIn { from { opacity: 0; } to { opacity: 1; } }
        .cpf-page-in { animation: cpfPageIn ${MOTION_PAGE_MS}ms ${MOTION_EASE} both; }
        @media (prefers-reduced-motion: reduce) {
          .cpf-page-in { animation: none; }
        }
      `}</style>
      <InactivityLogout />
      {children}
    </>
  );
}
