import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPortalUser } from "@/lib/app-access";
import { getGrantableApps } from "@/lib/app-registry";
import { CPLogo, CP_GOLD, CP_NAVY, CP_NAVY_DEEP } from "@/components/portal/cp-brand";
import { AccessManager } from "./access-manager";
import { updateUserAppAccess, resetUserPassword } from "./actions";

// R6 Phase F — Access Management: เฉพาะ Owner (isOwner=true อ่านสดจาก DB) — Role
// OWNER_ADMIN/user.manage ธรรมดาเข้าไม่ได้ตาม Requirement — Guard ฝั่ง Server ก่อน
// Render เสมอ (Direct URL เข้าไม่ได้ ไม่มี Flash ของเนื้อหา)
export default async function AccessManagementPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = await getPortalUser((session.user as any)?.id);
  if (!user) redirect("/login");
  if (!user.isOwner) redirect("/portal");

  const [users, accessRows] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      select: { id: true, username: true, displayName: true, role: true, isOwner: true },
      orderBy: { displayName: "asc" },
    }),
    db.userAppAccess.findMany({ select: { userId: true, appId: true } }),
  ]);

  const accessByUser: Record<string, string[]> = {};
  for (const row of accessRows) {
    (accessByUser[row.userId] ??= []).push(row.appId);
  }

  const apps = getGrantableApps().map((a) => ({ id: a.id, name: a.name, description: a.description }));

  return (
    <div
      className="min-h-screen cpf-page-in"
      style={{ background: `radial-gradient(1400px 800px at 70% -10%, #16305c 0%, ${CP_NAVY} 45%, ${CP_NAVY_DEEP} 100%)` }}
    >
      <header className="flex items-center gap-4 px-5 md:px-10 py-4 border-b border-white/10">
        <CPLogo width={96} className="shrink-0" />
        <div className="text-sm md:text-base tracking-[0.2em] text-slate-200">ACCESS MANAGEMENT</div>
        <Link href="/portal" className="ml-auto text-xs text-slate-300 hover:text-white border border-white/15 rounded-lg px-3 py-1.5">
          ← กลับ Application Portal
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        <h1 className="text-xl font-semibold" style={{ color: "#E8CE8C" }}>
          จัดการสิทธิ์การเข้าถึงแอปพลิเคชัน
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          เลือกผู้ใช้ แล้วกำหนดว่าเข้าใช้งานแอปพลิเคชันใดได้บ้าง — สิทธิ์ภายในแต่ละแอป (ทำอะไรได้บ้าง)
          ยังเป็นไปตามบทบาท (Role) เดิมของผู้ใช้ทุกประการ
        </p>

        <AccessManager
          users={users.map((u) => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            role: u.role,
            isOwner: u.isOwner,
            isSelf: u.id === user.id,
            appIds: accessByUser[u.id] ?? [],
          }))}
          apps={apps}
          action={updateUserAppAccess}
          resetPasswordAction={resetUserPassword}
          goldColor={CP_GOLD}
        />
      </main>
    </div>
  );
}
