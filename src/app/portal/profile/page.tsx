import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getPortalUser } from "@/lib/app-access";
import { CPLogo, CP_NAVY, CP_NAVY_DEEP } from "@/components/portal/cp-brand";
import { ProfileForm } from "./profile-form";
import { updateMyProfile, changeMyPassword } from "./actions";
import Link from "next/link";

// R6 Phase F — Owner UAT: My Profile — เข้าถึงได้ทุก User ที่ Login แล้ว (ไม่ผูกกับ
// App Access Matrix เพราะเป็นเรื่องบัญชีของตัวเอง ไม่ใช่ "Application" ใน Registry —
// เหมือนกับที่หน้า /portal เองก็ไม่เช็ค App Access เช่นกัน)
export default async function MyProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = await getPortalUser((session.user as any)?.id);
  if (!user) redirect("/login");

  const ROLE_LABEL: Record<string, string> = {
    OWNER_ADMIN: "ผู้ดูแลระบบ",
    BILLING_STAFF: "พนักงานออกบิล",
    VIEWER: "ผู้ดูรายงาน",
  };
  const roleLabel = ROLE_LABEL[user.role] ?? user.role;

  return (
    <div className="min-h-screen cpf-page-in" style={{ background: `radial-gradient(1400px 800px at 70% -10%, #16305c 0%, ${CP_NAVY} 45%, ${CP_NAVY_DEEP} 100%)` }}>
      {/* Mobile: โลโก้ย่อ + ลิงก์กลับตัดคำยาวออกบนจอเล็ก กัน Header ล้นแนวนอน */}
      <header className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 md:px-10 py-4 border-b border-white/10">
        <CPLogo width={96} className="shrink-0 max-w-[72px] sm:max-w-none" />
        <div className="text-xs sm:text-sm md:text-base tracking-[0.2em] text-slate-200">MY PROFILE</div>
        <Link
          href="/portal"
          className="ml-auto shrink-0 whitespace-nowrap text-xs text-slate-300 hover:text-white border border-white/15 rounded-lg px-3 py-2 sm:py-1.5"
        >
          ← กลับ<span className="hidden sm:inline"> Application Portal</span>
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8">
        <ProfileForm
          user={{
            username: user.username,
            displayName: user.displayName,
            titlePrefix: user.titlePrefix,
            avatarDataUri: user.avatarDataUri,
            roleLabel,
            isOwner: user.isOwner,
          }}
          updateProfileAction={updateMyProfile}
          changePasswordAction={changeMyPassword}
        />
      </main>
    </div>
  );
}
