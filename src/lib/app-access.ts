import { db } from "@/lib/db";
import { APP_REGISTRY, getAppById, type AppDefinition } from "@/lib/app-registry";

// ==========================================================================
// R6 Phase F — App Access ชั้นที่ 1 (User เข้า Application ไหนได้)
// แยกชัดจาก Permission Matrix เดิม (ชั้นที่ 2 — can()/Role ใน permissions.ts ไม่แตะเลย)
//
// ทุกฟังก์ชันอ่าน DB "สด" ต่อ Request เสมอ (ไม่ Cache ใน JWT/Session) — ตาม Requirement
// ตรงๆ ว่าถ้าถูก Revoke ระหว่าง Session อยู่ Request/Navigation ถัดไปต้องถูกปฏิเสธทันที
// ==========================================================================

export type PortalUser = {
  id: string;
  displayName: string;
  role: string;
  isOwner: boolean;
};

/** อ่านสถานะ User สดจาก DB ด้วย id จาก Session — คืน null ถ้า User หาย/ถูกปิดใช้งาน
 * (Session ค้างของ User ที่ถูกปิด ต้องไม่ผ่าน Guard ใดๆ) */
export async function getPortalUser(userId: string | undefined): Promise<PortalUser | null> {
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, role: true, active: true, isOwner: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, displayName: user.displayName, role: user.role, isOwner: user.isOwner };
}

/** User นี้เข้าแอพ appId ได้ไหม — Owner เข้าได้ทุกแอพที่ enabled เสมอ (รวม ownerOnly),
 * คนอื่นต้องมีแถว UserAppAccess และแอพต้อง enabled และต้องไม่ใช่ ownerOnly */
export async function hasAppAccess(user: PortalUser, appId: string): Promise<boolean> {
  const app = getAppById(appId);
  if (!app || app.status !== "enabled") return false;
  if (app.ownerOnly) return user.isOwner;
  if (user.isOwner) return true;
  const row = await db.userAppAccess.findUnique({ where: { userId_appId: { userId: user.id, appId } } });
  return row !== null;
}

/** รายการแอพทั้งหมดที่ User นี้ควรเห็นเป็น Card บน Portal — เรียงตามลำดับใน Registry
 * เสมอ — แอพ coming_soon แสดงให้ทุกคนเห็น (เป็น Card ล็อก กดไม่ได้ ไม่มี Route จริงให้
 * Guard) ส่วนแอพ enabled แสดงเฉพาะที่มีสิทธิ์จริงเท่านั้น (ไม่มีสิทธิ์ = Card ไม่ขึ้นเลย
 * ตาม Requirement — ไม่ใช่ขึ้นแบบ Disabled) */
export async function getVisibleApps(user: PortalUser): Promise<{ app: AppDefinition; accessible: boolean }[]> {
  const grants = user.isOwner
    ? null
    : new Set((await db.userAppAccess.findMany({ where: { userId: user.id }, select: { appId: true } })).map((r) => r.appId));

  const visible: { app: AppDefinition; accessible: boolean }[] = [];
  for (const app of APP_REGISTRY) {
    if (app.status === "coming_soon") {
      visible.push({ app, accessible: false });
      continue;
    }
    if (app.ownerOnly) {
      if (user.isOwner) visible.push({ app, accessible: true });
      continue;
    }
    if (user.isOwner || grants!.has(app.id)) visible.push({ app, accessible: true });
  }
  return visible;
}
