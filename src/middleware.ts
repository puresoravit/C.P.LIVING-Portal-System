export { default } from "next-auth/middleware";

// ทุก route ยกเว้น /login, /api/auth/*, static assets ต้อง login ก่อนถึงจะเข้าได้
// /api/backup/auto ก็ยกเว้นด้วย — ตั้งใจให้เรียกได้โดยไม่ต้อง login (เช่นจาก
// Windows Task Scheduler / cron) route handler ของมันเองมี BACKUP_SECRET
// token ป้องกันอยู่แล้ว (ผ่าน Authorization header) เป็นกลไกยืนยันตัวตนแยกต่างหาก
export const config = {
  matcher: ["/((?!login|api/auth|api/backup/auto|_next/static|_next/image|favicon.ico).*)"],
};
