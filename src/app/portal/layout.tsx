import { InactivityLogout } from "@/components/portal/inactivity-logout";

// R6 Phase F — Owner UAT Fix: ครอบทุกหน้าใต้ /portal ด้วย Inactivity Auto-Logout
// (แอพ Billing มีตัวเดียวกันใน (dashboard)/layout.tsx — Timestamp ใช้ Key ร่วมกันใน
// localStorage จึงนับ Activity ต่อเนื่องข้ามแอพ/ข้าม Tab ถูกต้อง)
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <InactivityLogout />
      {children}
    </>
  );
}
