"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

// ==========================================================================
// R6 Phase F — Owner UAT Fix: Auto Logout เมื่อไม่มี User Activity ต่อเนื่อง
// (Limit ปัจจุบันดูที่ INACTIVITY_LIMIT_MS ด้านล่าง — Owner ปรับ 15→60 นาที 2026-08-24
// เพราะ 15 นาทีสั้นเกินไปสำหรับรอบทำงาน UAT จริง ต้อง Login ใหม่แทบทุกรอบ)
//
// หลักการ:
// - นับเฉพาะ Interaction จริงของผู้ใช้ (pointer/click/keyboard/scroll/touch/input) —
//   Background Request/Polling/Animation ไม่แตะ Event เหล่านี้จึงไม่ Reset Timer เอง
//   โดยธรรมชาติ (ไม่ต้องมี Logic แยกกรอง)
// - เวลา Activity ล่าสุดเก็บใน localStorage ร่วมกันทุก Tab (Key เดียว) — ใช้งานอยู่ Tab
//   ไหนก็ต่ออายุให้ทุก Tab, หมดเวลาแล้ว Tab ไหนตรวจเจอก่อนก็ SignOut (Cookie ถูกล้าง
//   ที่เดียว มีผลทุก Tab — Tab อื่นเจอ Middleware เด้งไป Login เองใน Request ถัดไป)
// - SignOut ใช้ next-auth signOut() เดิมของระบบ 100% — ไม่มี Session System คู่ขนาน
//   ไม่แตะ JWT Lifetime เดิม (30 วัน absolute ยังเท่าเดิม — นี่คือ Inactivity Timeout
//   ฝั่ง UX/Client ซ้อนบน Security เดิม ไม่ได้ลดความปลอดภัยส่วนไหนลง)
// - กัน Back/bfcache: หน้า Protected ที่ถูก Restore จากความจำ (pageshow persisted)
//   ให้ Reload ทันที — Server/Middleware ตัดสินใหม่เสมอว่า Session ยังใช้ได้ไหม
// ==========================================================================

const LAST_ACTIVITY_KEY = "cpfLastActivity";
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 60 นาที (Owner สั่งขยายจาก 15 นาที)
const CHECK_INTERVAL_MS = 30 * 1000; // ตรวจทุก 30 วินาที
const WRITE_THROTTLE_MS = 5 * 1000; // เขียน localStorage ไม่ถี่กว่า 5 วิ (กัน I/O รัว)

export function InactivityLogout() {
  const signingOut = useRef(false);

  useEffect(() => {
    let lastWrite = 0;

    function touch() {
      const now = Date.now();
      if (now - lastWrite < WRITE_THROTTLE_MS) return;
      lastWrite = now;
      try {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      } catch {
        // localStorage เต็ม/ถูกปิด — ปล่อยผ่าน (อย่างแย่ Timer ฝั่งนี้ไม่ Reset)
      }
    }

    function expire() {
      if (signingOut.current) return;
      signingOut.current = true;
      // Redirect พร้อม Flag ให้หน้า Login แสดงข้อความ Session Expired
      signOut({ callbackUrl: "/login?expired=1" });
    }

    function check() {
      const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
      const last = raw ? Number(raw) : NaN;
      // ไม่มีค่า/ค่าเสีย = เพิ่งเริ่ม (Mount ตามหลัง Navigation ของผู้ใช้จริงเสมอ) — ตั้งใหม่
      if (!Number.isFinite(last)) {
        touch();
        return;
      }
      if (Date.now() - last >= INACTIVITY_LIMIT_MS) expire();
    }

    // การมาถึงหน้านี้คือผลจาก Action ของผู้ใช้ (คลิกลิงก์/Login/พิมพ์ URL) — นับเป็น
    // Activity เริ่มต้น กันกรณี Login ใหม่แล้วเจอ Timestamp ค้างเก่าจน Logout ทันที
    lastWrite = 0;
    touch();

    const events: (keyof WindowEventMap)[] = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart", "input"];
    for (const ev of events) window.addEventListener(ev, touch, { passive: true });

    const interval = setInterval(check, CHECK_INTERVAL_MS);

    // bfcache Hardening — หน้า Protected ที่ถูกดึงคืนจากความจำหลัง Back ให้ Reload
    // เพื่อให้ Middleware/Server Guard ตัดสินจาก Session จริงปัจจุบันเสมอ
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);

    return () => {
      for (const ev of events) window.removeEventListener(ev, touch);
      clearInterval(interval);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
