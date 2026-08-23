// R6 Phase F — Brand Elements ของ C.P. LIVING GROUP สำหรับ Splash/Login/Portal เท่านั้น
// (แอพ Billing เดิม/เอกสาร Print ใช้โลโก้เดิมจาก AppSetting/public/logo.jpg ไม่แตะ) —
// วาดโลโก้เป็น Inline SVG ตาม Direction ของ Owner (หลังคา 2 ชั้น + "C.P." สีทอง) ไม่พึ่ง
// ไฟล์รูป/Library ภายนอก จึงคมทุกขนาดและคุมสีทองด้วย Gradient เดียวกันทุกจุด

export const CP_GOLD = "#C9A24B";
export const CP_GOLD_LIGHT = "#E8CE8C";
export const CP_NAVY = "#0B1B3A";
export const CP_NAVY_DEEP = "#071228";

export const CP_TAGLINE = "TRUSTED • STRONG • RELIABLE • TOGETHER";
export const CP_MOTTO_1 = "BUILDING TRUST. STRENGTHENING FUTURES.";
export const CP_MOTTO_2 = "TOGETHER, EVERY DAY.";

/** โลโก้หลังคา C.P. สีทอง — ใช้ currentColor ไม่ได้เพราะต้องการ Gradient ทอง จึงฝัง
 * gradient ไว้ในตัว (id ผูกกับ instance ผ่าน suffix กัน id ชนกันเมื่อมีหลายตัวในหน้าเดียว) */
export function CPLogo({ size = 96, idSuffix = "a" }: { size?: number; idSuffix?: string }) {
  const gid = `cp-gold-${idSuffix}`;
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 120 98" fill="none" aria-label="C.P. LIVING GROUP logo" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="120" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={CP_GOLD_LIGHT} />
          <stop offset="0.5" stopColor={CP_GOLD} />
          <stop offset="1" stopColor="#A87F2E" />
        </linearGradient>
      </defs>
      {/* หลังคาชั้นนอก */}
      <path d="M8 62 L60 8 L112 62" stroke={`url(#${gid})`} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      {/* หลังคาชั้นใน */}
      <path d="M34 62 L60 34 L86 62" stroke={`url(#${gid})`} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <text
        x="60"
        y="92"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="bold"
        fontSize="26"
        letterSpacing="2"
        fill={`url(#${gid})`}
      >
        C.P.
      </text>
    </svg>
  );
}

/** เส้นแบ่งทองเรียวกลางจาง — ใต้ชื่อแบรนด์ ตาม Reference ทุกภาพ */
export function GoldDivider({ width = 280 }: { width?: number }) {
  return (
    <div
      aria-hidden
      className="mx-auto"
      style={{
        width,
        height: 2,
        background: `linear-gradient(90deg, transparent, ${CP_GOLD} 30%, ${CP_GOLD_LIGHT} 50%, ${CP_GOLD} 70%, transparent)`,
      }}
    />
  );
}
