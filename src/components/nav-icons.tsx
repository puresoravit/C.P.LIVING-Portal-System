// Owner UAT — Billing UI Visual Polish (2026-08-24): ชุด Icon สำหรับ Sidebar Nav
// เท่านั้น — วาดเองเป็น Path เรขาคณิตพื้นฐาน (Rect/Circle/Line/Polyline) ไม่ใช้ Path
// จาก Icon Library ภายนอกใดๆ (ไม่เพิ่ม Dependency ใหม่ให้ Project — ตรวจแล้วไม่มี Icon
// Library อยู่เดิมเลย) — Style อ้างอิงจาก Convention ที่มีอยู่แล้วจริงในระบบ (Hamburger
// Icon เดิมใน sidebar-shell.tsx: viewBox 24x24, stroke=currentColor, strokeWidth=2,
// strokeLinecap="round" fill="none") ทุก Icon ในไฟล์นี้ใช้ Convention เดียวกันเป๊ะ เพื่อ
// ความสม่ำเสมอทั้งระบบ (ข้อกำหนด "ใช้ icon family/style เดียวกันทั้งระบบ") — เลือก
// รูปแบบ/ความหมายของแต่ละ Icon จาก Function จริงของเมนูนั้นในระบบ C.P. LIVING เอง
// ไม่ได้ Copy จาก Reference Image ใดๆ (Reference ใช้เพื่อวิเคราะห์ Visual Language
// เท่านั้นตามที่ Owner กำชับ)
import type { SVGProps } from "react";

export type NavIconKey =
  | "dashboard"
  | "documentPlus"
  | "quotation"
  | "delivery"
  | "receipt"
  | "receiptDownload"
  | "billing"
  | "repair"
  | "edit"
  | "folder"
  | "list"
  | "chart"
  | "users"
  | "user"
  | "branch"
  | "box"
  | "tag"
  | "layers"
  | "priceTag"
  | "percent"
  | "upload"
  | "history"
  | "calculator"
  | "settings"
  | "building"
  | "printer"
  | "shield"
  | "database"
  | "terminal"
  | "logout"
  | "grid";

type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill" | "stroke">;

// Base ร่วม: ทุก Icon เรียก Shell นี้แทนเขียน <svg> ซ้ำ 30 รอบ (จุดเดียวคุม
// viewBox/strokeWidth/strokeLinecap ทั้งระบบ — ปรับความหนาเส้นทีเดียวได้ทุก Icon)
function Shell({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

const PATHS: Record<NavIconKey, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </>
  ),
  documentPlus: (
    <>
      <path d="M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5v4h4" />
      <path d="M12 12v6M9 15h6" />
    </>
  ),
  quotation: (
    <>
      <path d="M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5v4h4" />
      <path d="M8.5 13c0-1 .8-1.6 1.7-1.6s1.6.6 1.6 1.4c0 1.8-3.3 1.4-3.3 3.4 0 .9.8 1.5 1.7 1.5s1.7-.6 1.7-1.6" />
    </>
  ),
  delivery: (
    <>
      <rect x="2.5" y="7" width="11" height="9" rx="1" />
      <path d="M13.5 10h3.6l3.4 3v3h-2" />
      <circle cx="7" cy="18.5" r="1.7" />
      <circle cx="16.5" cy="18.5" r="1.7" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3v-17Z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
    </>
  ),
  receiptDownload: (
    <>
      <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3v-17Z" />
      <path d="M12 7.5v6M9.3 11.2 12 13.9l2.7-2.7" />
    </>
  ),
  billing: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="1.8" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h4" />
    </>
  ),
  repair: (
    <>
      <path d="M14.7 3.7a4 4 0 0 0-5.2 4.9L3.7 14.4a1.7 1.7 0 0 0 2.4 2.4l5.8-5.8a4 4 0 0 0 4.9-5.2l-2.6 2.6-2-2 2.5-2.7Z" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20l1-4.3L15.3 5.4a1.7 1.7 0 0 1 2.4 0l1 1a1.7 1.7 0 0 1 0 2.4L8.3 19 4 20Z" />
      <path d="M13 7.2 16.8 11" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 6.2a1 1 0 0 1 1-1H9l2 2.2h8.5a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6.2Z" />
    </>
  ),
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.3" cy="6.5" r="1" />
      <circle cx="4.3" cy="12" r="1" />
      <circle cx="4.3" cy="17.5" r="1" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M6 20.5v-6M11 20.5V8M16 20.5v-9.5" />
      <path d="M4.5 12.5 9.5 7l3.5 3.5 6-6.5" />
    </>
  ),
  users: (
    <>
      <circle cx="8.3" cy="8" r="3" />
      <path d="M2.7 19.5c.6-3.4 3-5.3 5.6-5.3s5 1.9 5.6 5.3" />
      <path d="M15.5 5.5a3 3 0 0 1 0 5.8" />
      <path d="M16.5 14.4c2.3.4 4 2.1 4.5 5.1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c.8-4 3.6-6.2 7.2-6.2s6.4 2.2 7.2 6.2" />
    </>
  ),
  branch: (
    <>
      <path d="M12 21s6.5-5.9 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15.1 12 21 12 21Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5V16L12 20.5 3.5 16Z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v8.5" />
    </>
  ),
  tag: (
    <>
      <path d="M11.6 3.5H19a1 1 0 0 1 1 1v7.4a1 1 0 0 1-.3.7l-8.6 8.6a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1 0-1.4l8.6-8.6a1 1 0 0 1 .3-.7Z" />
      <circle cx="15.7" cy="8.3" r="1.4" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5 3.5 8.2 12 12.9l8.5-4.7Z" />
      <path d="m3.5 12 8.5 4.7L20.5 12" />
      <path d="m3.5 15.8 8.5 4.7 8.5-4.7" />
    </>
  ),
  priceTag: (
    <>
      <path d="M11.6 3.5H19a1 1 0 0 1 1 1v7.4a1 1 0 0 1-.3.7l-8.6 8.6a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1 0-1.4l8.6-8.6a1 1 0 0 1 .3-.7Z" />
      <path d="M14.5 7.5 16.5 9.5M16.5 7.5 14.5 9.5" />
    </>
  ),
  percent: (
    <>
      <path d="M19 5 5 19" />
      <circle cx="7.3" cy="7.3" r="2.3" />
      <circle cx="16.7" cy="16.7" r="2.3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5v-11M8 8l4-4 4 4" />
      <path d="M4.5 15.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-3.5" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12.5" r="8" />
      <path d="M12 8v4.5l3 2" />
      <path d="M12 2.5v2.3M8 3.2l.7 2" />
    </>
  ),
  calculator: (
    <>
      <rect x="5" y="2.8" width="14" height="18.4" rx="1.6" />
      <path d="M7.5 6.5h9" />
      <circle cx="7.7" cy="11.3" r=".15" />
      <circle cx="12" cy="11.3" r=".15" />
      <circle cx="16.3" cy="11.3" r=".15" />
      <circle cx="7.7" cy="15" r=".15" />
      <circle cx="12" cy="15" r=".15" />
      <circle cx="7.7" cy="18.7" r=".15" />
      <path d="M14.5 13.5v6.5M17.2 16.8h-5.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8 6.2 6.2" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3.5" width="11" height="17" rx="1" />
      <path d="M16 10.5h3v10h-3" />
      <path d="M8 7.5h.01M11.5 7.5h.01M8 11h.01M11.5 11h.01M8 14.5h.01M11.5 14.5h.01" />
    </>
  ),
  printer: (
    <>
      <path d="M6.5 8.5V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v4.5" />
      <rect x="3" y="8.5" width="18" height="8" rx="1.4" />
      <path d="M6.5 13.5h11V21h-11Z" />
      <circle cx="17.3" cy="11.2" r=".2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.5v5.7c0 4.5 3 7.7 7 9.3 4-1.6 7-4.8 7-9.3V5.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5V18c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.5" />
      <path d="M4.5 11.8c0 1.5 3.4 2.7 7.5 2.7s7.5-1.2 7.5-2.7" />
    </>
  ),
  terminal: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="1.6" />
      <path d="m6.5 9 3.3 3-3.3 3M12 15h5.5" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 20.5H5.8a1.3 1.3 0 0 1-1.3-1.3V4.8a1.3 1.3 0 0 1 1.3-1.3H9.5" />
      <path d="M16 16.5 20.5 12 16 7.5" />
      <path d="M20.5 12h-11" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="1.2" />
      <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="1.2" />
      <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="1.2" />
      <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="1.2" />
    </>
  ),
};

/** Icon เดี่ยวสำหรับ Sidebar Nav — ขนาด/Stroke สม่ำเสมอทุกจุดผ่าน Shell เดียวกัน
 * (ข้อกำหนด "ขนาดและ alignment สม่ำเสมอ") — currentColor เสมอ ให้สืบสีจาก Parent
 * (Active/Inactive State คุมสีให้จาก sidebar-nav.tsx ไม่ต้องส่ง Prop สีเข้ามาตรงนี้) */
export function NavIcon({ name, className, ...props }: { name: NavIconKey } & IconProps) {
  return (
    <Shell className={className} {...props}>
      {PATHS[name]}
    </Shell>
  );
}
