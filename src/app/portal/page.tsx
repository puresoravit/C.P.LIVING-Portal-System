import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getPortalUser, getVisibleApps } from "@/lib/app-access";
import { CPLogo, GoldDivider, CP_TAGLINE, CP_GOLD, CP_NAVY, CP_NAVY_DEEP } from "@/components/portal/cp-brand";
import { SignOutButton } from "@/components/sign-out-button";
import { AppIcon } from "@/components/portal/app-icon";

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
      <header className="flex items-center justify-between gap-4 px-5 md:px-10 py-4 border-b border-white/10">
        <div className="flex items-center gap-4 min-w-0">
          {/* Owner UAT Polish — ขยาย ~10% จากเดิม (118 → 130) */}
          <CPLogo width={130} className="shrink-0" />
          <div className="hidden sm:block h-8 w-px bg-white/15" aria-hidden />
          <div className="hidden sm:block text-sm md:text-base tracking-[0.25em] text-slate-200 whitespace-nowrap">APPLICATION PORTAL</div>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <div
            aria-hidden
            className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0"
            style={{ background: `linear-gradient(135deg, #E8CE8C, ${CP_GOLD})`, color: CP_NAVY_DEEP }}
          >
            {user.displayName.trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{user.displayName}</div>
            <div className="text-xs text-slate-400 truncate">{roleLabel}</div>
          </div>
          <SignOutButton className="text-xs text-slate-400 hover:text-red-300 border border-white/15 rounded-lg px-3 py-1.5 ml-1 whitespace-nowrap" />
        </div>
      </header>

      {/* ---------- Main ---------- */}
      <main className="flex-1 flex flex-col items-center px-5 md:px-10 py-10 md:py-14">
        <div className="text-center">
          <div className="text-lg md:text-xl text-slate-300">Welcome back,</div>
          {/* Owner UAT Polish — ลดความหนาจาก font-semibold → font-medium ให้เบา/เรียบหรู
              ขึ้น ไม่ให้ชื่อ "ตะโกน" เกินข้อความรอบข้าง (สี/ขนาดคงเดิม) */}
          <h1 className="mt-1 text-3xl md:text-4xl font-medium" style={{ color: "#E8CE8C" }}>
            {user.displayName}
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

            return accessible && app.route ? (
              <Link key={app.id} href={app.route} className={cardClass}>
                {inner}
              </Link>
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
