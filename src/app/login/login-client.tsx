"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CPLogo, CP_TAGLINE, CP_MOTTO_1, CP_MOTTO_2, CP_NAVY, CP_NAVY_DEEP, CP_GOLD, MOTION_EASE } from "@/components/portal/cp-brand";

// ==========================================================================
// R6 Phase F — Branded Entry: Splash Screen → Cross-fade → Login
//
// - Splash แสดงครั้งเดียวต่อ Browser Session (sessionStorage) — Login ผิดแล้วหน้า
//   ไม่เด้ง Splash ซ้ำให้รำคาญ, Refresh ระหว่าง Session เดิมก็ไม่ซ้ำ
// - First Paint เป็นพื้น Navy เสมอ (ไม่มี Flash ขาว/Layout Jump) — ตัดสินใจว่าจะเล่น
//   Splash หรือเข้า Login ตรงๆ หลัง Mount (อ่าน sessionStorage ได้เฉพาะ Client)
// - prefers-reduced-motion: ข้าม Animation ทั้งหมด เข้า Login ทันที
// - Auth Semantics เดิม 100%: signIn("credentials") + Rate Limit เดิม — เปลี่ยนแค่
//   ปลายทางหลัง Login สำเร็จเป็น /portal (Application Portal) ตาม Requirement
// - "Remember me" ไม่มี: Session เป็น JWT อายุ 30 วันค่าเดียวของระบบเดิม ไม่มี Semantics
//   จำ/ไม่จำแยกให้ Toggle จริง — ห้ามหลอก UI // "Forgot password" ไม่มี: ระบบไม่มี
//   Password Recovery Flow จริง (Reset ทำโดย Owner/ผู้ดูแลระบบเท่านั้น) — ซ่อนตาม
//   Requirement ห้ามสร้าง Fake Flow
// ==========================================================================

export function LoginClient({ hasBgImage, sessionExpired }: { hasBgImage: boolean; sessionExpired: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // "boot" = ยังไม่ตัดสินใจ (พื้น Navy เปล่า กันกระพริบ), "splash" = กำลังเล่น Splash,
  // "fading" = Splash กำลัง Cross-fade ออก, "login" = ฟอร์มพร้อมใช้
  const [stage, setStage] = useState<"boot" | "splash" | "fading" | "login">("boot");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Owner UAT Polish — Root Cause ที่ Splash โดนข้าม: เดิม Gate ด้วย sessionStorage
    // "ครั้งเดียวต่อ Tab" ทำให้เปิดเว็บรอบถัดไปใน Tab เดิม (รวมถึงหลัง Logout) ไม่เห็น
    // Splash เลย — เจตนาจริงของ Owner คือ "ไม่มี Session แล้วเข้าเว็บ = เห็น Splash เสมอ"
    // ซึ่งการมาถึงหน้านี้คือกรณีไม่มี Session โดยนิยามอยู่แล้ว (Middleware กันคนมี Session
    // ไม่ให้หลุดมาที่นี่ ยกเว้นเข้า /login ตรงๆ) — จึงเล่น Splash ทุกครั้งที่ Mount ยกเว้น:
    // (a) Redirect จาก Session หมดอายุ (?expired=1) — ผู้ใช้ควร Login กลับได้เร็ว ไม่ต้อง
    //     ดู Splash ซ้ำ (b) prefers-reduced-motion
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || sessionExpired) {
      setStage("login");
      return;
    }
    setStage("splash");
    // Owner UAT Polish — ลดระยะเวลาที่เห็น Splash ลง ~1s จากรอบก่อน (Hold สั้นลง เริ่ม
    // Cross-fade เร็วขึ้นที่ 4.2s แทน 5.2s) — ความ "นุ่ม" ของ Cross-fade เองไม่ถูกตัดทอน
    // เลย (ระยะเวลา Fade ยังคง 1.6s เท่าเดิมเป๊ะ แค่ขยับจุดเริ่มเร็วขึ้น) โลโก้ลอยเข้า ~1.8s
    // → Tagline/Motto ตามทีละจังหวะ → Hold สั้นๆ → Cross-fade 1.6s (จบ ~5.8s รวม)
    timers.current.push(setTimeout(() => setStage("fading"), 4200));
    timers.current.push(setTimeout(() => setStage("login"), 5800));
    return () => timers.current.forEach(clearTimeout);
  }, [sessionExpired]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    // Requirement: Login สำเร็จต้องเข้า Application Portal ก่อนเสมอ — Fade การ์ดออก
    // สั้นๆ (350ms) ให้การเปลี่ยนหน้านุ่ม ไม่ตัดฉับ (Auth สำเร็จไปแล้ว ณ จุดนี้ —
    // Animation ไม่ได้หน่วง Security ใดๆ และปุ่มถูก disable ระหว่างนี้ กันกดซ้ำ)
    setLeaving(true);
    window.setTimeout(() => {
      router.push("/portal");
      router.refresh();
    }, 620);
  }

  const splashVisible = stage === "splash" || stage === "fading";

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${CP_NAVY} 0%, ${CP_NAVY_DEEP} 70%)` }}>
      <style>{`
        @keyframes cpfFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes cpfLogoIn { from { opacity: 0; transform: scale(0.94) translateY(8px); } to { opacity: 1; transform: none; } }
        .cpf-logo-in { animation: cpfLogoIn 1.8s ${MOTION_EASE} both; }
        .cpf-t2 { animation: cpfFadeUp 1.1s ${MOTION_EASE} 1.5s both; }
        .cpf-t3 { animation: cpfFadeUp 1.1s ${MOTION_EASE} 2.2s both; }
        .cpf-card-in { animation: cpfFadeUp 1.1s ${MOTION_EASE} 0.2s both; }
        .cpf-splash-out { opacity: 0; transition: opacity 1.6s ${MOTION_EASE}; }
        .cpf-leave { opacity: 0; transition: opacity 0.6s ${MOTION_EASE}; }
        @media (prefers-reduced-motion: reduce) {
          .cpf-logo-in, .cpf-t2, .cpf-t3, .cpf-card-in { animation: none; }
          .cpf-splash-out, .cpf-leave { transition: none; }
        }
      `}</style>

      {/* ---------- LOGIN LAYER (อยู่ล่าง Splash เสมอ — Cross-fade เนียนไม่มีจอว่าง) ---------- */}
      {/* Mobile: overflow-y-auto ให้ Scroll ได้เมื่อ Keyboard เปิดแล้วพื้นที่แนวตั้งไม่พอ
          (iOS/Android Keyboard กินครึ่งจอ — ฟอร์มต้องเลื่อนถึงทุก Field เสมอ ไม่โดน Clip) */}
      {(stage === "fading" || stage === "login") && (
        <div className={`absolute inset-0 flex flex-col overflow-y-auto ${leaving ? "cpf-leave" : ""}`}>
          {/* พื้นหลังภาพโรงงาน: วางไฟล์ที่ public/login-bg.jpg — Server ตรวจว่ามีไฟล์จริง
              ก่อนแล้วส่ง hasBgImage ลงมา (ไม่มีไฟล์ = ไม่ยิง Request เลย เหลือพื้น Navy
              Premium เป็น Fallback โดยไม่มี 404 ใน Console) */}
          {hasBgImage && (
            <div aria-hidden className="absolute inset-0" style={{ backgroundImage: "url(/login-bg.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
          )}
          {/* Overlay ให้อ่านการ์ดง่ายไม่ว่าภาพพื้นหลังจะสว่างแค่ไหน */}
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(7,18,40,0.35) 0%, rgba(7,18,40,0.55) 100%)" }} />

          <div className="relative flex-1 flex items-center justify-center p-4 py-6">
            {/* Mobile: ลด Padding การ์ดลงบนจอเล็ก (จอ 320px การ์ดเหลือ ~288px — px-8 เดิม
                กินที่จนเนื้อหาแคบกว่าโลโก้) — Desktop คงเดิมทุกค่า */}
            <form
              onSubmit={handleSubmit}
              className="cpf-card-in w-full max-w-md rounded-2xl bg-white/95 backdrop-blur shadow-2xl px-6 py-8 sm:px-8 sm:py-9"
            >
              <div className="flex flex-col items-center mb-5">
                {/* Owner UAT — Master Logo ขยายอีก ~10% จากรอบก่อน (228 → 251) — ใช้ width
                    เดียว Aspect Ratio เดิมของ Asset เป๊ะ ไม่ตัดต่อ/แก้ไฟล์โลโก้ —
                    max-w-full: จอแคบกว่าโลโก้ให้ Scale ลงตามการ์ด (Ratio คงเดิม) ไม่ล้น */}
                <CPLogo width={251} className="max-w-full" />
                {/* Owner UAT — ขยับ Welcome ขึ้นชิดโลโก้กว่าเดิม (mt-2 → mt-1) ลด Empty
                    Space ระหว่าง Logo/Welcome — Subtitle ตามชิด Welcome ในสัดส่วนเดิม */}
                <h1 className="mt-1 text-3xl font-semibold" style={{ color: CP_NAVY }}>
                  Welcome
                </h1>
                <p className="mt-0.5 text-sm text-gray-500">Sign in to continue to C.P. Living Group</p>
              </div>

              {sessionExpired && !error && (
                <div role="status" className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  เซสชันหมดอายุเนื่องจากไม่มีการใช้งาน — กรุณาเข้าสู่ระบบใหม่
                  <span className="block text-xs text-amber-700/80 mt-0.5">Session expired. Please sign in again.</span>
                </div>
              )}
              {error && (
                <div role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <label className="block mb-4">
                <span className="sr-only">ชื่อผู้ใช้ / Username</span>
                <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2" style={{ ["--tw-ring-color" as string]: CP_GOLD }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
                  </svg>
                  <input
                    autoFocus
                    required
                    placeholder="ชื่อผู้ใช้ / Username"
                    autoComplete="username"
                    className="flex-1 min-w-0 outline-none text-base sm:text-sm bg-transparent"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </label>

              <label className="block mb-6">
                <span className="sr-only">รหัสผ่าน / Password</span>
                <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2" style={{ ["--tw-ring-color" as string]: CP_GOLD }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" aria-hidden>
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    placeholder="รหัสผ่าน / Password"
                    autoComplete="current-password"
                    className="flex-1 min-w-0 outline-none text-base sm:text-sm bg-transparent"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {/* Eye Toggle — สลับเฉพาะ type ของ input (text/password) ไม่แตะ value/
                      Auth ใดๆ — Keyboard Accessible (เป็น <button> จริง มี aria) */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    aria-pressed={showPassword}
                    className="p-2 -my-1.5 -mr-1 text-gray-400 hover:text-gray-700 focus:outline-none focus:ring-2 rounded"
                    style={{ ["--tw-ring-color" as string]: CP_GOLD }}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M3 3l18 18" />
                        <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.4 2.5-2.9 3.9M6.6 6.6C4.3 8 2.7 10.1 2 12c1 2.5 5 7 10 7 1.4 0 2.7-.3 3.9-.9" />
                        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              <button
                disabled={loading}
                className="w-full text-white text-sm font-semibold rounded-xl py-3 transition-colors disabled:opacity-60"
                style={{ background: CP_NAVY }}
              >
                {loading ? "กำลังเข้าสู่ระบบ..." : "Sign In"}
              </button>

              <div className="mt-6 pt-4 border-t text-center text-xs text-gray-400">
                © 2026 C.P. Living Group. All rights reserved.
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- SPLASH LAYER ---------- */}
      {(stage === "boot" || splashVisible) && (
        <div
          aria-hidden={stage === "fading"}
          className={`absolute inset-0 flex items-center justify-center ${stage === "fading" ? "cpf-splash-out pointer-events-none" : ""}`}
          style={{ background: `radial-gradient(1200px 700px at 50% 30%, #12294f 0%, ${CP_NAVY} 45%, ${CP_NAVY_DEEP} 100%)` }}
        >
          {stage !== "boot" && (
            <div className="text-center px-6">
              <div className="cpf-logo-in inline-block">
                {/* Animate ทั้ง Asset เป็นก้อนเดียวตาม Requirement — ห้ามแยกชิ้นส่วนโลโก้ —
                    Mobile Landscape: จำกัดด้วย vh เพิ่ม กันโลโก้+Tagline สูงเกินจอเตี้ย */}
                <CPLogo width={380} className="max-w-[min(82vw,52vh)]" />
              </div>
              <div className="cpf-t2 mt-8 text-xs md:text-sm tracking-[0.35em]" style={{ color: CP_GOLD }}>
                {CP_TAGLINE}
              </div>
              <div className="cpf-t3 mt-5 text-[11px] md:text-xs tracking-[0.25em] text-slate-300/80 leading-relaxed">
                {CP_MOTTO_1}
                <br />
                {CP_MOTTO_2}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
