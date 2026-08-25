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
  // R6 Phase F Owner UAT Polish — เพิ่ม "brand" (public/brand/* — Master Logo) เข้า
  // ข้อยกเว้น: หน้า Splash/Login ต้องโหลดโลโก้ได้ก่อน Login (เดิม Middleware เด้ง
  // Request รูปไปหน้า Login ทำให้โลโก้ไม่ขึ้นตอนยังไม่มี Session) — เป็น Static Asset
  // สาธารณะของแบรนด์ ไม่มีข้อมูลอ่อนไหว
  // Production Smoke Test (2026-08-25) — เพิ่ม cp-app-switch.js เข้าข้อยกเว้น: เป็น
  // Public Script (public/cp-app-switch.js) ที่ต้องโหลดได้จากทุกหน้ารวมหน้า Login/Splash
  // ที่ยังไม่มี Session (Root Layout ฝัง <script src> ไว้ทุกหน้า) — เดิมไม่ได้ยกเว้นจึงถูก
  // Middleware เด้งไป /login เป็น 307 Redirect แทนที่จะได้ไฟล์ Script จริง → Browser Block
  // ด้วย CSP (script-src 'self' ไม่อนุญาต Redirect ข้าม Origin) → App-Switch Transition
  // ไม่ทำงานเลยตั้งแต่ต้น — Bug เดียวกันกับที่เคยแก้ให้ "brand" ไปแล้วก่อนหน้า (Static
  // Asset สาธารณะ ไม่มีข้อมูลอ่อนไหว)
  matcher: ["/((?!login|api/auth|api/backup/auto|_next/static|_next/image|favicon.ico|brand|cp-app-switch\\.js).*)"],
};
