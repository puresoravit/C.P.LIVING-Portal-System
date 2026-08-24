/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // Owner UAT — Global Typography: ให้ font-sans Utility (ถ้ามีใครใช้ในอนาคต) อ้าง
      // Stack เดียวกับ body ใน globals.css เสมอ — Single Source of Truth เดียวกัน ไม่มี
      // Stack คู่ขนานให้หลุด Sync กัน
      fontFamily: {
        sans: [
          "var(--font-latin)",
          "var(--font-thai)",
          "Segoe UI",
          "Tahoma",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      // Owner UAT — Billing UI Visual Polish (2026-08-24): Token กลาง 3 ตัวสำหรับงาน
      // Presentation ล้วนๆ (Sidebar Active Menu / Content Background) — cp-navy/
      // cp-navy-light คือค่าเดียวกับ CP_NAVY ใน src/components/portal/cp-brand.tsx
      // (Brand Blue ที่ Splash/Login/Portal ใช้อยู่แล้ว — Reuse โทนเดิมของแบรนด์แทนการ
      // คิดสีน้ำเงินใหม่ ให้ Billing App รู้สึกเป็นระบบเดียวกับ Portal) ไม่ได้ import ตรงๆ
      // จาก .tsx เพราะไฟล์นี้รันเป็น Node ธรรมดาตอน Build (ไม่ผ่าน TS/JSX Pipeline) — ถ้า
      // แก้ CP_NAVY ในอนาคตต้องแก้ค่านี้ให้ตรงกันด้วยมือ (Comment ไว้ทั้งสองฝั่งแล้ว)
      colors: {
        "cp-navy": "#0B1B3A", // = CP_NAVY
        "cp-navy-light": "#1E3A6E", // Stop ที่ 2 ของ Gradient (เข้มกว่า blue-600 มาตรฐานเล็กน้อย ให้หรูสมกับแบรนด์)
        // Owner UAT — Billing UI Visual Polish R2 (2026-08-24): Owner บอกว่า R1 (FAF6EF)
        // "เหลือง/ครีมมากเกินไป" — ปรับให้เย็นลงนิดหน่อย (ลด Gap ระหว่างช่อง R/G/B) ยังคง
        // ความอุ่นแบบ Warm Off-white ไว้แต่ Neutral ขึ้น
        "cp-cream": "#F7F5F0",
      },
    },
  },
  plugins: [],
};
