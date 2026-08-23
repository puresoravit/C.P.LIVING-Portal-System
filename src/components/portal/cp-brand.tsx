// R6 Phase F — Brand Elements ของ C.P. LIVING GROUP สำหรับ Splash/Login/Portal เท่านั้น
// (แอพ Billing เดิม/เอกสาร Print ใช้โลโก้เดิมจาก AppSetting/public/logo.jpg ไม่แตะ) —
// Owner UAT Fix: วาดทรงใหม่ตาม Reference ที่ถูกต้อง (ซุ้มโค้งมน 2 ชั้น ยอดโดม ขาผายออก
// เล็กน้อย + "C.P." ใต้สัญลักษณ์) แทนทรงหลังคาเหลี่ยมเดิมที่ผิดแบบ — สีทองเป็น Metallic
// Gradient หลายจุด + Highlight + เงาจาง ไม่ใช่ทอง Flat — ทุกหน้า Reuse Component ชุดนี้
// ชุดเดียว (Single Brand System)

export const CP_GOLD = "#C9A24B";
export const CP_GOLD_LIGHT = "#E8CE8C";
export const CP_NAVY = "#0B1B3A";
export const CP_NAVY_DEEP = "#071228";

export const CP_TAGLINE = "TRUSTED • STRONG • RELIABLE • TOGETHER";
export const CP_MOTTO_1 = "BUILDING TRUST. STRENGTHENING FUTURES.";
export const CP_MOTTO_2 = "TOGETHER, EVERY DAY.";

/** โลโก้ซุ้มโค้ง C.P. ตาม Reference — ซุ้มนอกยอดโดมกว้าง ขาตรงผายออกเล็กน้อย, ซุ้มใน
 * เล็กกว่าฐานเดียวกัน, "C.P." ใต้สัญลักษณ์ — Metallic Gold Gradient (สว่างบน-เข้มกลาง-
 * สะท้อนขอบ) + เงา Drop Shadow จางๆ ให้มิติแบบโลหะ — gradient/filter id ผูกกับ instance
 * ผ่าน idSuffix กัน id ชนกันเมื่อมีหลายตัวในหน้าเดียว */
export function CPLogo({ size = 96, idSuffix = "a" }: { size?: number; idSuffix?: string }) {
  const gid = `cp-gold-${idSuffix}`;
  const fid = `cp-shadow-${idSuffix}`;
  const hid = `cp-hi-${idSuffix}`;
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 120 110" fill="none" aria-label="C.P. LIVING GROUP logo" role="img">
      <defs>
        {/* Metallic Gold — ไล่เฉดเฉียง: ทองอ่อนสว่าง → ทองแท้ → ทองเข้มอมน้ำตาล →
            เด้งกลับสว่างที่ปลาย ให้ความรู้สึกโลหะสะท้อนแสงตาม Reference */}
        <linearGradient id={gid} x1="10" y1="6" x2="106" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F6E7B0" />
          <stop offset="0.28" stopColor="#E3C36E" />
          <stop offset="0.55" stopColor="#B98F33" />
          <stop offset="0.78" stopColor="#967020" />
          <stop offset="1" stopColor="#E9CD84" />
        </linearGradient>
        {/* Highlight บางๆ ทับสันบนซ้าย — จำลองแสงตกกระทบขอบโลหะ */}
        <linearGradient id={hid} x1="20" y1="8" x2="70" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF7DB" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#FFF7DB" stopOpacity="0" />
        </linearGradient>
        <filter id={fid} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter={`url(#${fid})`}>
        {/* ซุ้มนอก — ยอดโดมกว้าง ขาผายออกเล็กน้อย ปลายขาตัดตรง */}
        <path d="M15 78 L43 25 A20.5 20.5 0 0 1 77 25 L105 78" stroke={`url(#${gid})`} strokeWidth="10" strokeLinecap="butt" strokeLinejoin="round" />
        {/* ซุ้มใน — ทรงเดียวกัน เล็กกว่า ฐานเดียวกัน */}
        <path d="M41 78 L53 52 A9.5 9.5 0 0 1 67 52 L79 78" stroke={`url(#${gid})`} strokeWidth="8.5" strokeLinecap="butt" strokeLinejoin="round" />
        {/* Highlight เส้นบางทับสันบนซ้ายของซุ้มนอก */}
        <path d="M18 72 L43.5 25.5 A19 19 0 0 1 60 15.5" stroke={`url(#${hid})`} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.85" />
        {/* C.P. ใต้สัญลักษณ์ */}
        <text
          x="60"
          y="102"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="bold"
          fontSize="24"
          letterSpacing="2.5"
          fill={`url(#${gid})`}
        >
          C.P.
        </text>
      </g>
    </svg>
  );
}

/** ข้อความแบรนด์ทอง Metallic (เช่น "C.P. LIVING GROUP") — Gradient ทองไล่เฉดแนวตั้ง
 * ผ่าน background-clip:text + เงาจางผ่าน drop-shadow (text-shadow ใช้ไม่ได้กับตัวอักษร
 * โปร่งใส) — ใช้ร่วมกันทั้ง Splash/Login/Portal ให้เฉดทองตรงกันทุกหน้า */
export function GoldWordmark({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{
        backgroundImage: "linear-gradient(180deg, #F6E7B0 0%, #E3C36E 38%, #C9A24B 62%, #967020 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))",
        ...style,
      }}
    >
      {children}
    </span>
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
