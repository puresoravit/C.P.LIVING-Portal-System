import { withAuth } from "next-auth/middleware";
import { sessionTokenCookieName } from "@/lib/auth-cookies";

// ต้อง pass cookies.sessionToken.name + pages ให้ตรงกับ authOptions (src/lib/auth.ts)
// เอง — withAuth ที่ไม่ได้รับ options เลยจะเดา secure-cookie เองจาก NEXTAUTH_URL
// (startsWith "https://") ซึ่งเป็นคนละสัญญาณกับ useSecureCookies ใน authOptions ที่
// อิงตาม NODE_ENV ทำให้ทั้งสองฝั่งมองหา cookie คนละชื่อกันได้ในบางกรณี (พบระหว่าง
// Next.js 15 migration testing) — แก้โดยดึงชื่อ cookie จากตัวแปรร่วมเดียวกัน
// (src/lib/auth-cookies.ts) ไม่ต้องพึ่งสมมติฐานว่า NEXTAUTH_URL เป็น https เสมอ
export default withAuth({
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: sessionTokenCookieName,
    },
  },
});

// ทุก route ยกเว้น /login, /api/auth/*, static assets ต้อง login ก่อนถึงจะเข้าได้
// /api/backup/auto ก็ยกเว้นด้วย — ตั้งใจให้เรียกได้โดยไม่ต้อง login (เช่นจาก
// Windows Task Scheduler / cron) route handler ของมันเองมี BACKUP_SECRET
// token ป้องกันอยู่แล้ว (ผ่าน Authorization header) เป็นกลไกยืนยันตัวตนแยกต่างหาก
export const config = {
  matcher: ["/((?!login|api/auth|api/backup/auto|_next/static|_next/image|favicon.ico).*)"],
};
