// R6 Phase F — Brand Elements ของ C.P. LIVING GROUP สำหรับ Splash/Login/Portal เท่านั้น
// (แอพ Billing เดิม/เอกสาร Print ใช้โลโก้เดิมจาก AppSetting/public/logo.jpg ไม่แตะ)
//
// Owner UAT Polish — Master Logo Asset: ใช้ไฟล์ PNG พื้นหลังโปร่งใสที่ Owner อนุมัติ
// (public/brand/cp-logo.png — 1672×941, ครบทั้งสัญลักษณ์ซุ้มโค้ง + "C.P." +
// "C.P. LIVING GROUP" + เส้นทองล่าง ในไฟล์เดียว) เป็น Single Source of Truth —
// SVG ที่เคยวาดเอง + GoldWordmark (Gradient Text) ถูกถอดออกทั้งหมดแล้ว (Audit ยืนยันว่า
// ไม่มีจุดใช้งานอื่นเหลือ) ห้ามวาด/Trace/แต่งสีโลโก้ใหม่ด้วย CSS/SVG อีกเด็ดขาด —
// ทุกหน้าปรับได้เฉพาะขนาด Render (สัดส่วนคงเดิมเสมอผ่าน height:auto + object-contain)

export const CP_GOLD = "#C9A24B";
export const CP_GOLD_LIGHT = "#E8CE8C";
export const CP_NAVY = "#0B1B3A";
export const CP_NAVY_DEEP = "#071228";

export const CP_TAGLINE = "TRUSTED • STRONG • RELIABLE • TOGETHER";
export const CP_MOTTO_1 = "BUILDING TRUST. STRENGTHENING FUTURES.";
export const CP_MOTTO_2 = "TOGETHER, EVERY DAY.";

// Motion System กลาง — Splash/Login/Portal ใช้ Easing/จังหวะชุดเดียวกันให้รู้สึกเป็นระบบ
// เดียว (Premium/Calm: ease มาตรฐาน Material แบบนุ่ม ไม่เด้ง) — ทุกจุดที่ประกาศ Animation
// ต้องมี @media (prefers-reduced-motion: reduce) ปิดเสมอ
export const MOTION_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
export const MOTION_PAGE_MS = 900; // Fade เข้า/ออกระดับหน้า (Owner ขอนุ่ม/ช้าขึ้น)
export const MOTION_CARD_MS = 220; // Micro-interaction ของ Card/ปุ่ม

/** Master Logo — Render จากไฟล์ PNG ต้นฉบับตรงๆ เท่านั้น กำหนดได้เฉพาะความกว้าง
 * (สูงตามสัดส่วนจริงเสมอ) — ไม่มี Filter/Recolor ใดๆ ทับต้นฉบับ */
export function CPLogo({ width = 320, className = "" }: { width?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Asset ภายใน public เสิร์ฟตรง ไม่ต้อง Optimize pipeline
    <img
      src="/brand/cp-logo.png"
      alt="C.P. LIVING GROUP"
      className={className}
      style={{ width, height: "auto", objectFit: "contain" }}
      draggable={false}
    />
  );
}

/** เส้นแบ่งทองเรียวกลางจาง — ใช้เป็นเส้นคั่น Section ตกแต่ง (ไม่ใช่ส่วนหนึ่งของโลโก้ —
 * ตัวโลโก้มีเส้นของตัวเองอยู่ในไฟล์ Master แล้ว) */
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
