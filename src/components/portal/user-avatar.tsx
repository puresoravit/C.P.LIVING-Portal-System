import { CP_GOLD, CP_GOLD_LIGHT, CP_NAVY_DEEP } from "@/components/portal/cp-brand";

// R6 Phase F — Owner UAT: Single Source of Truth ของการ Render Avatar — ทุกจุดที่ต้อง
// โชว์รูป Profile (Portal Header, Profile Menu, My Profile) Import Component นี้ตัว
// เดียว ไม่มี Markup ซ้ำกันคนละแบบ — มีรูป (avatarDataUri จาก getPortalUser) = แสดงรูป,
// ไม่มี = Fallback ตัวอักษรแรกของชื่อบน Gradient ทอง (พฤติกรรมเดิมของ Portal Header)
export function UserAvatar({
  avatarDataUri,
  displayName,
  size = 40,
  className = "",
}: {
  avatarDataUri: string | null;
  displayName: string;
  size?: number;
  className?: string;
}) {
  if (avatarDataUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Data URI จาก DB ตรงๆ ไม่ต้องผ่าน Optimizer
      <img
        src={avatarDataUri}
        alt={displayName}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${CP_GOLD_LIGHT}, ${CP_GOLD})`,
        color: CP_NAVY_DEEP,
      }}
    >
      {displayName.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}
