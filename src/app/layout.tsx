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
  // Post-Go-live (2026-08-25) v8 — v7 เคยลองเว้นระยะขอบโปร่งใส 8% รอบสี่เหลี่ยมมน โดยเข้าใจ
  // ว่าขอบขาวเกิดจากรูปทรงชนขอบ Canvas ตรงๆ — Owner Feedback ตรงๆ ว่าขอบขาวใหญ่ขึ้นกว่าเดิม
  // (A/B ชัดเจน: v6 ไม่มี Margin = ขอบเล็กที่ยอมรับได้ / v7 เพิ่ม Margin = ขอบใหญ่ขึ้น) พิสูจน์
  // ว่าสมมติฐาน v7 ผิด — พื้นที่โปร่งใสมากขึ้นกลับทำให้ Safari แสดงพื้นที่ขาวมากขึ้นตาม ไม่ใช่
  // น้อยลง — v8 จึงย้อนกลับไปดีไซน์แบบ v6 (สี่เหลี่ยมมนทึบเต็มขอบ Canvas มนเฉพาะมุม ไม่มี
  // Margin) ซึ่งเป็นขนาดขอบที่ Owner เคยยอมรับได้มาก่อน (gen_icons.py: MARGIN_FRAC=0)
  //
  // แยกอีกประเด็น — /portal บาง Session แสดง Fallback "C" แทนไอคอนทั้งที่ /billing ขึ้นปกติ:
  // Audit ครบแล้ว (โค้ด: metadata ประกาศจุดเดียวทั้งแอพ ไม่มี Override ต่อ Route เลย, ไม่มี
  // manifest.json/Service Worker / Build: Chunk เดียวกัน (5376.js) ถูก Reference จากทั้ง
  // portal/page.js และ (dashboard)/**/page.js เป๊ะ มี icons Object แค่ชุดเดียวในทั้ง Build /
  // Network: Caddy Log ยืนยัน Request icon.png/favicon.ico ตอน Owner Reload หน้า Portal ได้
  // 200 OK ครบ — รูปถึงเครื่องจริง) สรุปได้ว่าไม่ใช่ปัญหาฝั่ง Server/โค้ดแล้ว เป็นพฤติกรรม
  // เฉพาะของ Safari เองหลัง Fetch สำเร็จ — ยังไม่ได้แก้ (Owner ปฏิเสธ JS Workaround ไปก่อน)
  //
  // ⚠️ กติกาสำคัญ: ทุกครั้งที่ "เนื้อไฟล์รูป" เปลี่ยน ต้อง Bump ?v= ทุกจุดพร้อมกันเสมอ —
  // Query String นี้คือ Cache Buster ตัวเดียวของ Tag ชุดนี้ — เคยพลาดจริงมาแล้ว: แก้รูปเป็น
  // Full-bleed แต่คง v=2 ไว้ → Browser ใช้รูปเก่าจาก Cache ต่อ ทั้งที่ Server เสิร์ฟไฟล์ใหม่แล้ว
  icons: {
    icon: [
      { url: "/icon.png?v=8", sizes: "32x32", type: "image/png" },
      { url: "/icon.png?v=8", sizes: "192x192", type: "image/png" },
      { url: "/icon.png?v=8", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=8",
    apple: "/apple-icon.png?v=8",
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
