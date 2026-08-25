import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPortalUser } from "@/lib/app-access";
import { APP_REGISTRY } from "@/lib/app-registry";
import { CPLogo, CP_GOLD, CP_NAVY, CP_NAVY_DEEP } from "@/components/portal/cp-brand";
import { AccessManager } from "./access-manager";
import {
  updateUserAppAccess,
  resetUserPassword,
  createEmployeeUser,
  updateUserRole,
  setUserActive,
  deleteUserPermanently,
} from "./actions";

// R6 Phase F — Access Management: เฉพาะ Owner (isOwner=true อ่านสดจาก DB) — Role
// OWNER_ADMIN/user.manage ธรรมดาเข้าไม่ได้ตาม Requirement — Guard ฝั่ง Server ก่อน
// Render เสมอ (Direct URL เข้าไม่ได้ ไม่มี Flash ของเนื้อหา)
export default async function AccessManagementPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = await getPortalUser((session.user as any)?.id);
  if (!user) redirect("/login");
  if (!user.isOwner) redirect("/portal");

  // Post-Go-live — รวมบัญชีที่ปิดใช้งานแล้วด้วย (Owner ต้องเห็นเพื่อเปิดกลับ/ลบถาวรได้
  // จากหน้านี้ — เดิม where active:true ทำให้บัญชีที่ปิดหายไปจากหน้าจอถาวร ไม่มีทางแก้)
  const [users, accessRows] = await Promise.all([
    db.user.findMany({
      select: { id: true, username: true, displayName: true, role: true, isOwner: true, active: true },
      orderBy: [{ active: "desc" }, { displayName: "asc" }],
    }),
    db.userAppAccess.findMany({ select: { userId: true, appId: true } }),
  ]);

  const accessByUser: Record<string, string[]> = {};
  for (const row of accessRows) {
    (accessByUser[row.userId] ??= []).push(row.appId);
  }

  // Owner UAT — แสดงแอปอนาคต (COMING SOON) ในรายการสิทธิ์ด้วยแบบ Disabled ให้ Owner
  // เห็นว่าระบบสิทธิ์รายคนรองรับหลายแอปตั้งแต่วันนี้ — เมื่อแอปเปิดใช้จริง Checkbox จะ
  // เปิดให้ติ๊กเองอัตโนมัติ (Server Action ยัง Filter เฉพาะ getGrantableApps เหมือนเดิม
  // — Defense-in-depth: ติ๊กแอปที่ยังไม่เปิดส่งมาก็ถูกทิ้งเงียบๆ)
  const apps = APP_REGISTRY.filter((a) => !a.ownerOnly).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    enabled: a.status === "enabled",
  }));

  return (
    <div
      className="min-h-screen cpf-page-in"
      style={{ background: `radial-gradient(1400px 800px at 70% -10%, #16305c 0%, ${CP_NAVY} 45%, ${CP_NAVY_DEEP} 100%)` }}
    >
      {/* Mobile: โลโก้ย่อ + ลิงก์กลับตัดคำยาวออกบนจอเล็ก กัน Header ล้นแนวนอน */}
      <header className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 md:px-10 py-4 border-b border-white/10">
        <CPLogo width={96} className="shrink-0 max-w-[72px] sm:max-w-none" />
        <div className="text-xs sm:text-sm md:text-base tracking-[0.2em] text-slate-200">ACCESS MANAGEMENT</div>
        <Link
          href="/portal"
          className="ml-auto shrink-0 whitespace-nowrap text-xs text-slate-300 hover:text-white border border-white/15 rounded-lg px-3 py-2 sm:py-1.5"
        >
          ← กลับ<span className="hidden sm:inline"> Application Portal</span>
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        <h1 className="text-xl font-semibold" style={{ color: "#E8CE8C" }}>
          จัดการสิทธิ์การเข้าถึงแอปพลิเคชัน
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          สร้างบัญชีพนักงานใหม่ และกำหนดว่าผู้ใช้แต่ละคนเข้าใช้งานแอปพลิเคชันใดได้บ้าง — สิทธิ์ภายใน
          แต่ละแอป (ทำอะไรได้บ้าง) เป็นไปตามบทบาท (Role) ของผู้ใช้
        </p>

        <AccessManager
          users={users.map((u) => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            role: u.role,
            isOwner: u.isOwner,
            isSelf: u.id === user.id,
            active: u.active,
            appIds: accessByUser[u.id] ?? [],
          }))}
          apps={apps}
          action={updateUserAppAccess}
          resetPasswordAction={resetUserPassword}
          createUserAction={createEmployeeUser}
          updateRoleAction={updateUserRole}
          setActiveAction={setUserActive}
          deleteUserAction={deleteUserPermanently}
          goldColor={CP_GOLD}
        />
      </main>
    </div>
  );
}
