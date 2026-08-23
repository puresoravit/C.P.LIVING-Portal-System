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
    },
  },
  plugins: [],
};
