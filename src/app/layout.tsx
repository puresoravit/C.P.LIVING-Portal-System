import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { manrope, lineSeedSansTH } from "@/fonts";

export const metadata: Metadata = {
  title: "C.P. LIVING Billing",
  description: "ระบบจัดการลูกค้า สินค้า ราคา ส่วนลด และออกบิล",
  // Post-Go-live (2026-08-25) — Owner พบว่า Safari ไม่แสดง Favicon เลยแม้ทดสอบใน Private
  // Browsing + ล้าง Website Data + ล้าง ~/Library/Safari/Favicon Cache + Restart เครื่องเต็ม
  // รูปแบบ — ไล่จนพบ Root Cause จริง: ไฟล์ icon.png/apple-icon.png/favicon.ico เดิมวางเป็น
  // Next.js App Router Special File Convention (src/app/icon.png ฯลฯ) ซึ่งถูก Serve ผ่าน
  // Route Handler ของ RSC Layer เอง — Header ที่ตอบกลับมาแปะ
  // `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch`
  // ทั้งที่เป็นแค่ไฟล์รูปนิ่งๆ (เทียบกับ public/apple-touch-icon.png ที่ทำงานปกติทุกที่ ไม่มี
  // Vary Header นี้เลย) — WebKit Disk Cache มีปัญหารู้จักอยู่กับ Vary หลายค่าแบบนี้ (Request
  // ขอ Favicon ไม่ได้ส่ง Header เหล่านี้เหมือน Page Navigation จริง ทำให้ Cache Key ไม่ตรงกัน
  // แล้วค้างเป็น Entry ว่างถาวร) — Chrome ทนกว่าเลยไม่เจอปัญหานี้ นี่คือสาเหตุที่ล้าง Cache
  // ทุกวิธีมาตรฐานแล้วไม่หาย เพราะปัญหาไม่ได้อยู่ที่ Cache แต่อยู่ที่ Header ที่ Server ส่งไป
  // แก้โดยย้ายไฟล์ทั้ง 3 ออกจาก src/app/ ไปเป็น Static File ธรรมดาใน public/ แทน (เหมือน
  // apple-touch-icon.png) ตัดผ่าน RSC Route Handler ไปเลย ไม่มี Vary Header ผิดปกติอีกต่อไป
  //
  // Post-Go-live (2026-08-25) v7 — Owner พบขอบขาวใน Tab ของ Safari (macOS 26) แม้ Pixel
  // ของไฟล์เดิมตรวจแล้วไม่มีสีขาวปนเลย (Alpha ไล่ 0→255 สะอาด ไม่มี RGB ขาว/เทาแทรก) —
  // เทียบกับ Favicon เว็บอื่น (เช่น Facebook) ที่ไม่เจอปัญหานี้ พบว่ารูปแบบต่างกันตรงที่ของ
  // เราเป็นสี่เหลี่ยมมนทึบเต็มขอบ Canvas (มีแค่ขอบมนที่มุม ไม่มีระยะขอบโปร่งใสจริงรอบรูป)
  // ตรงตาม Apple Icon Guideline ที่เตือนไว้: อย่าวาดรูปทรงชนขอบ Canvas เอง เพราะระบบ/เบราว์
  // เซอร์อาจ Mask + วาดเส้นขอบบางๆ ทับซ้อนที่ขอบรูปทรงนั้นพอดี (เห็นเป็นเส้นขาวเลียบขอบ) —
  // แก้โดยเว้นระยะขอบโปร่งใสจริงรอบสี่เหลี่ยมมนสีกรมท่า (Margin 8% รอบด้าน ก่อนค่อยมนมุม)
  // ให้เหมือน Favicon เว็บอื่นทั่วไปที่ไม่ชนขอบ Canvas ตรงๆ (ดู gen_icons.py แนวคิดเดียวกับ
  // v5: Supersample เฉพาะกรอบ Vector ไม่ Upscale รูปโลโก้จริง คมชัดเหมือนเดิม)
  //
  // ⚠️ กติกาสำคัญ: ทุกครั้งที่ "เนื้อไฟล์รูป" เปลี่ยน ต้อง Bump ?v= ทุกจุดพร้อมกันเสมอ —
  // Query String นี้คือ Cache Buster ตัวเดียวของ Tag ชุดนี้ — เคยพลาดจริงมาแล้ว: แก้รูปเป็น
  // Full-bleed แต่คง v=2 ไว้ → Browser ใช้รูปเก่าจาก Cache ต่อ ทั้งที่ Server เสิร์ฟไฟล์ใหม่แล้ว
  icons: {
    icon: [
      { url: "/icon.png?v=7", sizes: "32x32", type: "image/png" },
      { url: "/icon.png?v=7", sizes: "192x192", type: "image/png" },
      { url: "/icon.png?v=7", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=7",
    apple: "/apple-icon.png?v=7",
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
