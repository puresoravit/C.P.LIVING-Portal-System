import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { NAV_TREE, filterNav } from "@/lib/nav-tree";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarShell } from "@/components/sidebar-shell";
import { getPortalUser, hasAppAccess } from "@/lib/app-access";
import { InactivityLogout } from "@/components/portal/inactivity-logout";

const BRAND = "C.P. LIVING Billing";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // R6 Phase F — App Access ชั้นที่ 1: ทั้งแอพ Billing (Route Group นี้ทั้งหมด) ต้องมี
  // สิทธิ์เข้าแอพ "billing" ก่อน — เช็คสดจาก DB ทุก Request (Server-side จริง ไม่ใช่แค่
  // ซ่อน UI) ถูก Revoke ระหว่าง Session = Navigation ถัดไปเด้งกลับ Portal ทันที —
  // Permission ภายในแอพ (ชั้นที่ 2) ยังใช้ can()/Role เดิมทุกจุดเหมือนเดิมไม่แตะ
  const portalUser = await getPortalUser((session.user as any)?.id);
  if (!portalUser) redirect("/login");
  if (!(await hasAppAccess(portalUser, "billing"))) redirect("/portal");

  const role = (session.user as any).role as string;
  const roleLabel: Record<string, string> = {
    OWNER_ADMIN: "ผู้ดูแลระบบ",
    BILLING_STAFF: "พนักงานออกบิล",
    VIEWER: "ผู้ดูรายงาน",
  };
  // Phase Nav-1 — กรอง Nav Tree ด้วย can() ตัวเดียวกับทุกหน้าที่ใช้อยู่แล้ว
  // (ไม่มี Permission Logic ใหม่ ไม่ hardcode visibility ข้าม Permission Matrix เดิม)
  const visibleTree = filterNav(NAV_TREE, (perm: Permission) => can(role as any, perm));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* R6 Phase F — Auto Logout เมื่อไม่มี Activity 15 นาที (ดู inactivity-logout.tsx) */}
      <InactivityLogout />
      {/* ข้อ 7/10 (Print System): Sidebar ต้องไม่ติดไปกับ Print Preview/เอกสารที่พิมพ์ */}
      <SidebarShell
        brand={BRAND}
        userInfo={
          <>
            {session.user?.name} · {roleLabel[role] ?? role}
          </>
        }
      >
        {/* R6 Phase F — App Switcher: ทางกลับ Application Portal จากในแอพ Billing */}
        <a
          href="/portal"
          className="block mx-3 mt-3 mb-1 text-xs text-gray-600 hover:text-gray-900 border rounded-lg px-3 py-2 text-center print:hidden"
        >
          ⊞ Application Portal
        </a>
        <SidebarNav tree={visibleTree} />
      </SidebarShell>
      <main className="flex-1 p-6 print:p-0">{children}</main>
    </div>
  );
}
