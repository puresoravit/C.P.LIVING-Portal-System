import { NextResponse } from "next/server";
import { beginAuthentication } from "@/lib/webauthn";

// Phase G — ออก Authentication Options (Challenge) ให้หน้า Login ก่อนมี Session — อยู่ใต้
// /api/auth/* ซึ่ง Middleware ยกเว้นไว้แล้ว (ที่เดียวกับ NextAuth เอง) — ไม่เปิดเผยข้อมูล
// ใดๆ: Options ไม่มี allowCredentials (Usernameless) จึงไม่สามารถใช้ Endpoint นี้เดาว่า
// Username ไหนมี Passkey ได้ — Challenge ถูกเก็บฝั่ง Server พร้อมอายุ 2 นาที Single-use
// (ดู src/lib/webauthn.ts) ผู้เรียกได้แค่ challengeId ทึบๆ ไม่ใช่ค่าที่เชื่อถือได้ด้วยตัวเอง
export async function POST() {
  const { options, challengeId } = await beginAuthentication();
  return NextResponse.json({ options, challengeId }, { headers: { "Cache-Control": "no-store" } });
}
