"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { UserAvatar } from "@/components/portal/user-avatar";
import { CP_GOLD, MOTION_CARD_MS, MOTION_EASE } from "@/components/portal/cp-brand";

// R6 Phase F — Owner UAT: Profile Menu — ทำให้บริเวณ Avatar+ชื่อ+Role มุมขวาบน Portal
// กดได้ เปิด Dropdown Premium (โปร่งแสง Navy + ขอบทองจาง เข้าชุดกับ Portal) — Sign Out
// Reuse next-auth signOut() ตัวเดียวกับ SignOutButton เดิมทุกประการ (callbackUrl /login
// เหมือนเดิม ไม่มี Logout Path คู่ขนาน)
export function ProfileMenu({
  displayName,
  avatarDataUri,
  roleLabel,
}: {
  displayName: string;
  avatarDataUri: string | null;
  roleLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    // Mobile: min-w-0 ทั้ง Chain (root → button → text) ให้ชื่อยาว Truncate ได้จริงบนจอแคบ
    // แทนที่จะดัน Header ล้น — Dropdown ยึด right-0 กับ Trigger ที่ชิดขอบขวาจอ ไม่หลุด Viewport
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 sm:gap-3 min-w-0 rounded-xl px-2 py-1.5 -mx-2 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2"
        style={{ ["--tw-ring-color" as string]: CP_GOLD, transitionDuration: `${MOTION_CARD_MS}ms`, transitionTimingFunction: MOTION_EASE }}
      >
        <UserAvatar avatarDataUri={avatarDataUri} displayName={displayName} size={40} />
        <div className="min-w-0 text-left">
          <div className="text-sm font-medium text-white truncate">{displayName}</div>
          <div className="text-xs text-slate-400 truncate">{roleLabel}</div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-500 shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none", transitionDuration: `${MOTION_CARD_MS}ms`, transitionTimingFunction: MOTION_EASE }}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        role="menu"
        className="absolute right-0 mt-2 w-56 rounded-xl border border-white/15 bg-[#0d1f42]/95 backdrop-blur shadow-2xl overflow-hidden origin-top-right"
        style={{
          transitionProperty: "opacity, transform",
          transitionDuration: `${MOTION_CARD_MS}ms`,
          transitionTimingFunction: MOTION_EASE,
          opacity: open ? 1 : 0,
          transform: open ? "scale(1) translateY(0)" : "scale(0.96) translateY(-4px)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div className="px-4 py-3 border-b border-white/10">
          <div className="text-sm font-medium text-white truncate">{displayName}</div>
          <div className="text-xs text-slate-400 truncate">{roleLabel}</div>
        </div>
        <Link
          href="/portal/profile"
          role="menuitem"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.06] transition-colors"
          style={{ transitionDuration: "140ms" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
          </svg>
          โปรไฟล์ของฉัน / My Profile
        </Link>
        <button
          type="button"
          role="menuitem"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2.5 w-full text-left px-4 py-3 text-sm text-slate-300 hover:text-red-300 hover:bg-white/[0.06] transition-colors border-t border-white/10"
          style={{ transitionDuration: "140ms" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          ออกจากระบบ / Sign Out
        </button>
      </div>
    </div>
  );
}
