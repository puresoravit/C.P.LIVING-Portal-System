import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getPortalUser, getVisibleApps } from "@/lib/app-access";
import { CPLogo, GoldDivider, CP_TAGLINE, CP_GOLD, CP_NAVY, CP_NAVY_DEEP } from "@/components/portal/cp-brand";
import { AppIcon } from "@/components/portal/app-icon";
import { ProfileMenu } from "@/components/portal/profile-menu";
import { formatDisplayName } from "@/lib/user-profile";

// ==========================================================================
// R6 Phase F — Application Portal: จุดแรกหลัง Login เสมอ — เลือก Application ก่อนเข้า
// ระบบงานจริง — Server Component ล้วน: สิทธิ์ App Access ถูก Resolve ฝั่ง Server เสร็จ
// ก่อน Render จึงไม่มี Flash ของ Card ที่ User ไม่มีสิทธิ์ (Requirement ข้อ 9) — อ่าน
// สิทธิ์สดจาก DB ทุก Request (ไม่ Cache ใน JWT) Revoke ระหว่าง Session จึงมีผลตั้งแต่
// Navigation ถัดไปทันที
// ==========================================================================

const ROLE_LABEL: Record<string, string> = {
  OWNER_ADMIN: "ผู้ดูแลระบบ",
  BILLING_STAFF: "พนักงานออกบิล",
  VIEWER: "ผู้ดูรายงาน",
};

export default async function PortalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = await getPortalUser((session.user as any)?.id);
  if (!user) redirect("/login");

  const apps = await getVisibleApps(user);
  const roleLabel = user.isOwner ? "เจ้าของกิจการ / Owner" : ROLE_LABEL[user.role] ?? user.role;

  return (
    <div
      className="min-h-screen flex flex-col cpf-page-in"
      style={{ background: `radial-gradient(1400px 800px at 70% -10%, #16305c 0%, ${CP_NAVY} 45%, ${CP_NAVY_DEEP} 100%)` }}
    >
      {/* ---------- Header ---------- */}
      <header className="flex items-center justify-between gap-3 sm:gap-4 px-4 sm:px-5 md:px-10 py-4 border-b border-white/10">
        <div className="flex items-center gap-4 min-w-0 shrink-0">
          {/* Owner UAT Polish — ขยาย ~10% จากเดิม (118 → 130) — Mobile ย่อลงเล็กน้อย
              ให้ Profile Menu ด้านขวามีพื้นที่แสดงชื่อ (Ratio โลโก้คงเดิม) */}
          <CPLogo width={130} className="shrink-0 max-w-[104px] sm:max-w-none" />
          <div className="hidden sm:block h-8 w-px bg-white/15" aria-hidden />
          <div className="hidden sm:block text-sm md:text-base tracking-[0.25em] text-slate-200 whitespace-nowrap">APPLICATION PORTAL</div>
        </div>

        {/* Owner UAT — Avatar+ชื่อ+Role กดได้ เปิด Profile Menu (My Profile/Sign Out) —
            ดู profile-menu.tsx */}
        <ProfileMenu displayName={formatDisplayName(user.titlePrefix, user.displayName)} avatarDataUri={user.avatarDataUri} roleLabel={roleLabel} />
      </header>

      {/* ---------- Main ---------- */}
      {/* Owner UAT — Welcome Box Vertical Alignment: เดิม pt เท่ากับ pb (py-10 md:py-14)
          ทำให้ช่องว่าง Header→Welcome (56px ที่ md+) มากกว่าช่องว่าง Welcome→Cards (mt-10
          = 40px คงที่) อย่างเห็นได้ชัด — ตรึง pt ไว้ที่ 40px (pt-10) ทุก Breakpoint ให้เท่ากับ
          mt-10 ของ Cards Grid เป๊ะเสมอ (ค่าเดิมที่มีอยู่แล้วในระบบ ไม่ใช่เลข Offset ใหม่ที่
          คิดเอง) ส่วน pb ยังคง Responsive Scale เดิม (คุมระยะก่อน Footer แยกเรื่องกัน ไม่ใช่
          สิ่งที่ Owner ติงถึง) — ไม่แตะ Layout Structure/Grid ใดๆ */}
      <main className="flex-1 flex flex-col items-center px-5 md:px-10 pt-10 pb-10 md:pb-14">
        <div className="text-center">
          <div className="text-lg md:text-xl text-slate-300">Welcome back,</div>
          {/* Owner UAT Polish — ลดความหนาจาก font-semibold → font-medium ให้เบา/เรียบหรู
              ขึ้น ไม่ให้ชื่อ "ตะโกน" เกินข้อความรอบข้าง (สี/ขนาดคงเดิม) */}
          <h1 className="mt-1 text-3xl md:text-4xl font-medium" style={{ color: "#E8CE8C" }}>
            {formatDisplayName(user.titlePrefix, user.displayName)}
          </h1>
          <div className="mt-4">
            <GoldDivider width={300} />
          </div>
          <p className="mt-4 text-sm text-slate-400">Please select an application to continue</p>
        </div>

        {apps.every((a) => !a.accessible) && (
          <div className="mt-10 max-w-md text-center text-sm text-slate-300 bg-white/5 border border-white/10 rounded-xl px-5 py-4">
            บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าใช้งานแอปพลิเคชันใดๆ — กรุณาติดต่อเจ้าของกิจการเพื่อขอสิทธิ์การเข้าถึง
          </div>
        )}

        <div className="mt-10 grid gap-5 w-full max-w-6xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {apps.map(({ app, accessible }) => {
            const inner = (
              <>
                <div
                  className="w-16 h-16 rounded-full border flex items-center justify-center transition-colors"
                  style={{ borderColor: accessible ? CP_GOLD : "rgba(255,255,255,0.2)" }}
                >
                  <AppIcon icon={app.icon} accessible={accessible} />
                </div>
                <div className="mt-4 text-lg font-semibold text-white text-center leading-snug">{app.name}</div>
                <div className="mt-2 w-10 h-0.5" style={{ background: accessible ? CP_GOLD : "rgba(255,255,255,0.15)" }} aria-hidden />
                <p className="mt-3 text-xs text-slate-400 text-center leading-relaxed">{app.description}</p>
                <div className="mt-auto pt-4">
                  {accessible ? (
                    <span
                      aria-hidden
                      className="inline-flex w-9 h-9 rounded-full border items-center justify-center"
                      style={{ borderColor: CP_GOLD, color: CP_GOLD }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] tracking-wider text-slate-400 border border-white/15 rounded-full px-3 py-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <rect x="4" y="10" width="16" height="10" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                      COMING SOON
                    </span>
                  )}
                </div>
              </>
            );

            // Owner UAT Polish — Hover ขยายให้เห็นชัดขึ้นกว่าเดิม (1.02→1.06) + ยกสูงขึ้น
            // เล็กน้อย (-1→-1.5), Transition นุ่มขึ้น/ยาวขึ้น (200ms→320ms, Ease เดียวกับ
            // Motion System ของ Splash/Login) — Transform ไม่กระทบ Layout Flow ของ Card
            // ข้างเคียงอยู่แล้ว (ไม่ใช้ margin/size จริงเปลี่ยน) แค่เพิ่ม z-10 กัน Card ที่
            // ขยายทับเงาซ้อนใต้ Card ข้างๆ ดูค้าง — Active/Focus/Reduced-motion คงพฤติกรรมเดิม
            const cardClass =
              "flex flex-col items-center rounded-2xl border px-6 py-8 min-h-[300px] bg-white/[0.04] " +
              (accessible
                ? "relative border-white/15 transition-all duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:z-10 hover:-translate-y-1.5 hover:scale-[1.06] hover:border-[#C9A24B]/70 hover:bg-white/[0.07] hover:shadow-[0_14px_40px_rgba(201,162,75,0.2)] active:scale-[1.03] active:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24B] motion-reduce:transform-none motion-reduce:transition-none"
                : "border-white/10 opacity-70");

            // Owner UAT — App-Switch Transition: Card ที่พาออกนอกโซน Portal (เข้าแอป
            // Billing) ต้องเป็น <a> Full Page Load — Cross-document View Transition
            // (Cross-fade `cp-app-switch` ใน globals.css + public/cp-app-switch.js)
            // เล่นได้เฉพาะการนำทางข้ามหน้าจริง ไม่ใช่ SPA — ทำให้ทิศทาง Portal→Billing
            // เหมือน Billing→Portal (ซึ่งเป็น <a> อยู่แล้วใน (dashboard)/layout.tsx) —
            // Bonus ด้าน Security: เข้าแอปด้วย Full Request = App-Access Check ใน
            // (dashboard)/layout.tsx ยิงเสมอ — Card ภายในโซน Portal (เช่น Access
            // Management) ยังเป็น <Link> SPA เดิม (ไม่มี Animation ข้ามแอปให้ต้องเล่น)
            const leavesPortalZone = app.route && !app.route.startsWith("/portal");
            return accessible && app.route ? (
              leavesPortalZone ? (
                <a key={app.id} href={app.route} className={cardClass}>
                  {inner}
                </a>
              ) : (
                <Link key={app.id} href={app.route} className={cardClass}>
                  {inner}
                </Link>
              )
            ) : (
              <div key={app.id} className={cardClass} aria-disabled>
                {inner}
              </div>
            );
          })}
        </div>
      </main>

      <footer className="text-center pb-6 px-4">
        <div className="text-[11px] tracking-[0.3em]" style={{ color: CP_GOLD }}>
          {CP_TAGLINE}
        </div>
        <div className="mt-2 text-[11px] text-slate-500">© 2026 C.P. Living Group. All rights reserved.</div>
      </footer>
    </div>
  );
}
