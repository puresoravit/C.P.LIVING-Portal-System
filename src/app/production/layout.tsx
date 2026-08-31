import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { PRODUCTION_NAV_TREE } from "@/lib/production-nav-tree";
import { filterNav } from "@/lib/nav-tree";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarShell } from "@/components/sidebar-shell";
import { getPortalUser, hasAppAccess } from "@/lib/app-access";
import { InactivityLogout } from "@/components/portal/inactivity-logout";
import { formatDisplayName } from "@/lib/user-profile";
import { UserAvatar } from "@/components/portal/user-avatar";
import { NavIcon } from "@/components/nav-icons";

const BRAND = "C.P. LIVING Production & Delivery";

// Production & Delivery — แอปแยกจาก Billing ตาม Application Registry เดิม (app-registry.ts)
// ห้ามวางไว้ใต้ (dashboard) เพราะนั่นเป็น Route Group ของ Billing โดยเฉพาะ — Layout นี้
// คัด Pattern มาจาก (dashboard)/layout.tsx เป๊ะ (App Access guard ชั้น 1 + can()/Role
// เดิมชั้น 2) เปลี่ยนแค่ appId ที่เช็คและ Nav Tree ที่ใช้ ไม่แตะ Billing เลยแม้แต่บรรทัดเดียว
export default async function ProductionLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const portalUser = await getPortalUser((session.user as any)?.id);
  if (!portalUser) redirect("/login");
  if (!(await hasAppAccess(portalUser, "production"))) redirect("/portal");

  const role = (session.user as any).role as string;
  const roleLabel: Record<string, string> = {
    OWNER_ADMIN: "ผู้ดูแลระบบ",
    BILLING_STAFF: "พนักงานออกบิล",
    VIEWER: "ผู้ดูรายงาน",
  };
  const visibleTree = filterNav(PRODUCTION_NAV_TREE, (perm: Permission) => can(role as any, perm));

  return (
    <div className="flex min-h-screen print:min-h-0 print:block flex-col md:flex-row">
      <link rel="expect" href="#cp-sidebar" blocking="render" />
      <InactivityLogout />
      <SidebarShell
        brand={BRAND}
        userInfo={
          <span className="flex items-center gap-2 mt-1.5">
            <UserAvatar avatarDataUri={portalUser.avatarDataUri} displayName={portalUser.displayName} size={30} />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-white truncate leading-tight">
                {formatDisplayName(portalUser.titlePrefix, portalUser.displayName)}
              </span>
              <span className="block text-[11px] text-white/50 truncate leading-tight">{roleLabel[role] ?? role}</span>
            </span>
          </span>
        }
      >
        <a
          href="/portal"
          className="flex items-center justify-center gap-1.5 mx-3 mt-3 mb-1 text-xs text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-center transition-colors duration-150 print:hidden"
        >
          <NavIcon name="grid" className="w-3.5 h-3.5" />
          Application Portal
        </a>
        <SidebarNav tree={visibleTree} />
      </SidebarShell>
      <main className="flex-1 p-6 print:p-0 bg-cp-cream print:bg-white md:rounded-tl-[28px] print:rounded-none min-h-screen print:min-h-0">{children}</main>
    </div>
  );
}
