// Security headers สำหรับ production (ข้อ 51) — ระบบนี้ไม่มี external
// image/font/script เลย (ตรวจแล้ว) เลยตั้ง CSP แบบ self-only ได้เข้มงวด
// script-src/style-src ต้องมี 'unsafe-inline' เพราะ Next.js App Router เอง
// ฝัง hydration script แบบ inline (ไม่ได้ตั้ง nonce infra) และหน้าพิมพ์เอกสาร
// ใช้ inline <style> (printPageStyle()) กับ inline <script> ข้อมูล (safeJsonForScript)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // ไม่มีผลตอนรันผ่าน HTTP (dev/local) — browser จะใช้ค่านี้เฉพาะตอน
          // เปิดผ่าน HTTPS จริงเท่านั้น ตั้งไว้ล่วงหน้าให้พร้อมตอน deploy จริง
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
