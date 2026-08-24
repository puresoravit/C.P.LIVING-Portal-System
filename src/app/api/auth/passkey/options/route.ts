import { NextRequest, NextResponse } from "next/server";
import { beginAuthentication } from "@/lib/webauthn";
import { isOverLimit } from "@/lib/rate-limit";

// Phase G — ออก Authentication Options (Challenge) ให้หน้า Login ก่อนมี Session — อยู่ใต้
// /api/auth/* ซึ่ง Middleware ยกเว้นไว้แล้ว (ที่เดียวกับ NextAuth เอง) — ไม่เปิดเผยข้อมูล
// ใดๆ: Options ไม่มี allowCredentials (Usernameless) จึงไม่สามารถใช้ Endpoint นี้เดาว่า
// Username ไหนมี Passkey ได้ — Challenge ถูกเก็บฝั่ง Server พร้อมอายุ 2 นาที Single-use
// (ดู src/lib/webauthn.ts) ผู้เรียกได้แค่ challengeId ทึบๆ ไม่ใช่ค่าที่เชื่อถือได้ด้วยตัวเอง
//
// Production Readiness (Phase 2) — Rate Limit ต่อ IP (Deferred จาก Final Audit): Endpoint
// นี้เขียนแถว Challenge ลง DB โดยไม่ต้อง Login จึงควรมีเพดานกันยิงรัว — 30 ครั้ง/15 นาที
// หลวมพอสำหรับผู้ใช้จริงกด Retry หลายรอบ แต่ตัดการยิงถล่มทิ้ง — IP อ่านจาก
// x-forwarded-for ตัวแรก (Caddy ตั้งให้เสมอบน Production; Dev เข้าตรงไม่มี Header ใช้
// "local" ร่วมกันซึ่งเพดานหลวมพออยู่แล้ว)
const OPTIONS_MAX_PER_WINDOW = 30;
const OPTIONS_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (isOverLimit(`passkey-options:${ip}`, OPTIONS_MAX_PER_WINDOW, OPTIONS_WINDOW_MS)) {
    return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
  }
  const { options, challengeId } = await beginAuthentication();
  return NextResponse.json({ options, challengeId }, { headers: { "Cache-Control": "no-store" } });
}
