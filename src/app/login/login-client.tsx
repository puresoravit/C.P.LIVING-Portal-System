"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CPLogo, GoldDivider, GoldWordmark, CP_TAGLINE, CP_MOTTO_1, CP_MOTTO_2, CP_NAVY, CP_NAVY_DEEP, CP_GOLD } from "@/components/portal/cp-brand";

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

const SPLASH_KEY = "cpfSplashShown";

export function LoginClient({ hasBgImage, sessionExpired }: { hasBgImage: boolean; sessionExpired: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // "boot" = ยังไม่ตัดสินใจ (พื้น Navy เปล่า กันกระพริบ), "splash" = กำลังเล่น Splash,
  // "fading" = Splash กำลัง Cross-fade ออก, "login" = ฟอร์มพร้อมใช้
  const [stage, setStage] = useState<"boot" | "splash" | "fading" | "login">("boot");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = window.sessionStorage.getItem(SPLASH_KEY) === "1";
    if (reduced || seen) {
      setStage("login");
      return;
    }
    window.sessionStorage.setItem(SPLASH_KEY, "1");
    setStage("splash");
    timers.current.push(setTimeout(() => setStage("fading"), 2600));
    timers.current.push(setTimeout(() => setStage("login"), 3300));
    return () => timers.current.forEach(clearTimeout);
  }, []);

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
    // Requirement: Login สำเร็จต้องเข้า Application Portal ก่อนเสมอ
    router.push("/portal");
    router.refresh();
  }

  const splashVisible = stage === "splash" || stage === "fading";

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${CP_NAVY} 0%, ${CP_NAVY_DEEP} 70%)` }}>
      <style>{`
        @keyframes cpfFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes cpfLogoIn { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: scale(1); } }
        .cpf-logo-in { animation: cpfLogoIn 0.9s ease-out both; }
        .cpf-t1 { animation: cpfFadeUp 0.7s ease-out 0.5s both; }
        .cpf-t2 { animation: cpfFadeUp 0.7s ease-out 0.9s both; }
        .cpf-t3 { animation: cpfFadeUp 0.7s ease-out 1.2s both; }
        .cpf-card-in { animation: cpfFadeUp 0.55s ease-out both; }
        .cpf-splash-out { opacity: 0; transition: opacity 0.7s ease; }
        @media (prefers-reduced-motion: reduce) {
          .cpf-logo-in, .cpf-t1, .cpf-t2, .cpf-t3, .cpf-card-in { animation: none; }
          .cpf-splash-out { transition: none; }
        }
      `}</style>

      {/* ---------- LOGIN LAYER (อยู่ล่าง Splash เสมอ — Cross-fade เนียนไม่มีจอว่าง) ---------- */}
      {(stage === "fading" || stage === "login") && (
        <div className="absolute inset-0 flex flex-col">
          {/* พื้นหลังภาพโรงงาน: วางไฟล์ที่ public/login-bg.jpg — Server ตรวจว่ามีไฟล์จริง
              ก่อนแล้วส่ง hasBgImage ลงมา (ไม่มีไฟล์ = ไม่ยิง Request เลย เหลือพื้น Navy
              Premium เป็น Fallback โดยไม่มี 404 ใน Console) */}
          {hasBgImage && (
            <div aria-hidden className="absolute inset-0" style={{ backgroundImage: "url(/login-bg.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
          )}
          {/* Overlay ให้อ่านการ์ดง่ายไม่ว่าภาพพื้นหลังจะสว่างแค่ไหน */}
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(7,18,40,0.35) 0%, rgba(7,18,40,0.55) 100%)" }} />

          <div className="relative flex-1 flex items-center justify-center p-4">
            <form
              onSubmit={handleSubmit}
              className="cpf-card-in w-full max-w-md rounded-2xl bg-white/95 backdrop-blur shadow-2xl px-8 py-9"
            >
              <div className="flex flex-col items-center mb-5">
                <CPLogo size={72} idSuffix="login" />
                <GoldWordmark className="mt-2 text-lg font-semibold tracking-[0.18em]">C.P. LIVING GROUP</GoldWordmark>
                <div className="mt-2 w-full">
                  <GoldDivider width={240} />
                </div>
                <h1 className="mt-4 text-3xl font-bold" style={{ color: CP_NAVY }}>
                  Welcome
                </h1>
                <p className="mt-1 text-sm text-gray-500">Sign in to continue to C.P. Living Group</p>
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
                    className="flex-1 outline-none text-sm bg-transparent"
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
                    className="flex-1 outline-none text-sm bg-transparent"
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
                    className="p-1 text-gray-400 hover:text-gray-700 focus:outline-none focus:ring-2 rounded"
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
                <CPLogo size={150} idSuffix="splash" />
              </div>
              <div className="cpf-t1 mt-5">
                <GoldWordmark className="text-2xl md:text-3xl font-semibold tracking-[0.3em]">C.P. LIVING GROUP</GoldWordmark>
              </div>
              <div className="cpf-t1 mt-5">
                <GoldDivider width={320} />
              </div>
              <div className="cpf-t2 mt-6 text-xs md:text-sm tracking-[0.35em]" style={{ color: CP_GOLD }}>
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
