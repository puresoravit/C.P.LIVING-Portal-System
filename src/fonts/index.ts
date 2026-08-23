import { Manrope } from "next/font/google";
import localFont from "next/font/local";

// ==========================================================================
// Owner UAT — Global Typography: จุดเดียวที่ประกาศ Font ทั้งระบบ (ห้ามหน้าไหน Hardcode
// Font Stack เอง) — English/Latin/ตัวเลข ใช้ Manrope (Variable Font จาก Google Fonts,
// next/font self-host ให้อัตโนมัติตอน Build ไม่มี Request ไป Google ตอน Runtime), ไทยใช้
// LINE Seed Sans TH (Static WOFF2 5 น้ำหนักจาก seed.line.me, License SIL OFL 1.1 — ดู
// src/fonts/line-seed-sans-th/LICENSE.txt) — ประกาศเป็นคนละ CSS Variable แล้วรวม Stack
// เดียวใน globals.css: `var(--font-latin), var(--font-thai), ...` ให้ Browser เลือก Glyph
// ตาม Character เอง (มาตรฐาน CSS Font Fallback — Manrope ไม่มี Thai Glyph จึง "ตก" ไปที่
// LINE Seed Sans TH โดยอัตโนมัติทุกตัวอักษรไทย ไม่ต้องแยก :lang() เอง)
// ==========================================================================
export const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-latin",
  display: "swap",
});

// LINE Seed Sans TH มีแค่ 5 น้ำหนักตายตัว (Thin/Regular/Bold/ExtraBold/Heavy — ไม่มี
// Medium/SemiBold) — ประกาศแต่ละไฟล์เป็น "ช่วง" font-weight (CSS รองรับการประกาศ Static
// Font Face ด้วย weight range ได้ ไม่ต้องเป็น Variable Font จริง) ให้ font-medium(500)/
// font-semibold(600) ที่ใช้อยู่ทั่วระบบ (403/73 จุด) Snap ไปน้ำหนักที่ใกล้เคียงแทนกระโดด
// ไป Bold/Regular แบบสุดขั้ว — คงลำดับชั้นเดิม (Regular/Medium อ่านเบา, SemiBold/Bold
// อ่านหนัก) แม้ Glyph จริงจะมีแค่ 2 ระดับหลัก (Regular/Bold) ก็ตาม
export const lineSeedSansTH = localFont({
  src: [
    { path: "./line-seed-sans-th/LINESeedSansTH_W_Th.woff2", weight: "100 300", style: "normal" },
    { path: "./line-seed-sans-th/LINESeedSansTH_W_Rg.woff2", weight: "301 550", style: "normal" },
    { path: "./line-seed-sans-th/LINESeedSansTH_W_Bd.woff2", weight: "551 750", style: "normal" },
    { path: "./line-seed-sans-th/LINESeedSansTH_W_XBd.woff2", weight: "751 850", style: "normal" },
    { path: "./line-seed-sans-th/LINESeedSansTH_W_He.woff2", weight: "851 900", style: "normal" },
  ],
  variable: "--font-thai",
  display: "swap",
});
