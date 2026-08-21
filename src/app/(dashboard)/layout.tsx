import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { NAV_TREE, filterNav } from "@/lib/nav-tree";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarShell } from "@/components/sidebar-shell";

const BRAND = "C.P. LIVING Billing";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

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
      {/* ข้อ 7/10 (Print System): Sidebar ต้องไม่ติดไปกับ Print Preview/เอกสารที่พิมพ์ */}
      <SidebarShell
        brand={BRAND}
        userInfo={
          <>
            {session.user?.name} · {roleLabel[role] ?? role}
          </>
        }
      >
        <SidebarNav tree={visibleTree} />
      </SidebarShell>
      <main className="flex-1 p-6 print:p-0">{children}</main>
    </div>
  );
}
