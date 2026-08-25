import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { manrope, lineSeedSansTH } from "@/fonts";

export const metadata: Metadata = {
  title: "C.P. LIVING Billing",
  description: "ระบบจัดการลูกค้า สินค้า ราคา ส่วนลด และออกบิล",
  // Post-Go-live (2026-08-25) — Owner พบว่า Safari ไม่แสดง Favicon เลยแม้ทดสอบใน Private
  // Browsing (ตัดปัญหา Cache ออกไปแล้ว) — เดิมพึ่ง Next.js File Convention ล้วนๆ
  // (src/app/icon.png ประกาศแค่ <link rel="icon" sizes="512x512">) ซึ่ง Safari บางเวอร์ชัน
  // ไม่ค่อยเชื่อถือ Tag เดียวขนาดใหญ่แบบนี้สำหรับ Tab Icon และมักมองหา rel="shortcut icon"
  // ชี้ .ico โดยเฉพาะ (พฤติกรรมเก่าแก่ที่ WebKit ยังคงพึ่งอยู่) — ประกาศ icons ตรงนี้เอง
  // ให้ครบทุก rel/ขนาดที่ Browser หลากยุคมองหา แทนพึ่ง Auto-inject จาก Convention เพียง
  // เส้นทางเดียว — ไฟล์จริงยังเป็นชุดเดิม (icon.png/apple-icon.png/favicon.ico) ไม่เปลี่ยน
  //
  // ⚠️ กติกาสำคัญ: ทุกครั้งที่ "เนื้อไฟล์รูป" เปลี่ยน ต้อง Bump ?v= ทุกจุดพร้อมกันเสมอ —
  // Query String นี้คือ Cache Buster ตัวเดียวของ Tag ชุดนี้ (ต่างจาก Convention Auto-inject
  // ที่ Next.js แปะ Content Hash ให้เอง) — เคยพลาดจริงมาแล้ว: แก้รูปเป็น Full-bleed แต่คง
  // v=2 ไว้ → Safari ใช้รูปเก่าจาก Cache ต่อ (ขอบขาว) ทั้งที่ Server เสิร์ฟไฟล์ใหม่แล้ว
  icons: {
    icon: [
      { url: "/icon.png?v=4", sizes: "32x32", type: "image/png" },
      { url: "/icon.png?v=4", sizes: "192x192", type: "image/png" },
      { url: "/icon.png?v=4", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=4",
    apple: "/apple-icon.png?v=4",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Owner UAT — Global Typography: ประกาศ CSS Variable ของทั้ง 2 Font ที่ <html> จุดเดียว
    // ทั้งแอพสืบทอด (globals.css body ใช้ var(--font-latin)/var(--font-thai) ประกอบ Stack)
    <html lang="th" className={`${manrope.variable} ${lineSeedSansTH.variable}`}>
      <body className="bg-gray-50 text-gray-900">
        {/* Owner UAT — App-Switch Transition (Portal↔Billing): ต้องเป็น Script แบบ
            Blocking ต้นๆ ของ Body — Listener `pagereveal` ต้องลงทะเบียนก่อนเฟรมแรก
            ของหน้าใหม่ (ยิงก่อน Render ครั้งแรก) — ไฟล์เล็กมากและ Cache ได้ จึงไม่
            กระทบความเร็วโหลด (ดูคำอธิบายเต็มใน public/cp-app-switch.js) */}
        <script src="/cp-app-switch.js" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
