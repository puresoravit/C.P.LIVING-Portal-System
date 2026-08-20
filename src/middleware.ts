export { default } from "next-auth/middleware";

// ทุก route ยกเว้น /login, /api/auth/*, static assets ต้อง login ก่อนถึงจะเข้าได้
export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
