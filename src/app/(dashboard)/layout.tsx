import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { NAV_TREE, filterNav } from "@/lib/nav-tree";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarShell } from "@/components/sidebar-shell";
import { getPortalUser, hasAppAccess } from "@/lib/app-access";
import { InactivityLogout } from "@/components/portal/inactivity-logout";
import { formatDisplayName } from "@/lib/user-profile";
import { UserAvatar } from "@/components/portal/user-avatar";
import { NavIcon } from "@/components/nav-icons";

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
        // Owner UAT — อ่านชื่อ/คำนำหน้า/รูปสดจาก portalUser (getPortalUser) แทน
        // session.user.name ที่มาจาก JWT ค้าง — Sync ทันทีหลังแก้ My Profile โดยไม่ต้อง
        // Re-login (Single Source of Truth เดียวกับ Portal) — UserAvatar เป็น Component
        // เดียวกับ Portal/Profile Menu (มีรูป=รูปจริง ไม่มี=Initial Fallback) — Logo
        // บริษัทยังเป็น Brand แยกที่บรรทัด brand ด้านบน ไม่ปนกับรูป User
        userInfo={
          <span className="flex items-center gap-2 mt-1.5">
            <UserAvatar avatarDataUri={portalUser.avatarDataUri} displayName={portalUser.displayName} size={30} />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-gray-800 truncate leading-tight">
                {formatDisplayName(portalUser.titlePrefix, portalUser.displayName)}
              </span>
              <span className="block text-[11px] text-gray-500 truncate leading-tight">{roleLabel[role] ?? role}</span>
            </span>
          </span>
        }
      >
        {/* R6 Phase F — App Switcher: ทางกลับ Application Portal จากในแอพ Billing —
            Owner UAT Visual Polish: เปลี่ยนจาก Unicode Glyph "⊞" ดิบๆ เป็น NavIcon
            (grid) ตัวเดียวกับชุด Sidebar เพื่อความสม่ำเสมอ (ข้อ 5 Design Consistency) —
            href/สิทธิ์/พฤติกรรมเดิมทุกประการ ไม่แตะ */}
        <a
          href="/portal"
          className="flex items-center justify-center gap-1.5 mx-3 mt-3 mb-1 text-xs text-gray-600 hover:text-gray-900 hover:border-cp-navy/30 border rounded-lg px-3 py-2 text-center transition-colors duration-150 print:hidden"
        >
          <NavIcon name="grid" className="w-3.5 h-3.5" />
          Application Portal
        </a>
        <SidebarNav tree={visibleTree} />
      </SidebarShell>
      {/* Owner UAT — Billing UI Visual Polish: พื้น Content Area จากขาวล้วน → Warm
          Off-white (cp-cream, ดู tailwind.config.js) — จุดควบคุมเดียว กระทบทุกหน้าใน
          Route Group นี้พร้อมกัน — Card/Table/Form ยังเป็น bg-white เดิมทุกใบ จึงยังแยก
          จาก Background ได้ชัดเจนเหมือนเดิม (ไม่แตะ Component ใดๆ ของแต่ละหน้าเลย) */}
      <main className="flex-1 p-6 print:p-0 bg-cp-cream print:bg-white min-h-screen">{children}</main>
    </div>
  );
}
