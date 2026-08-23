"use server";

import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getGrantableApps } from "@/lib/app-registry";
import { validateNewPassword } from "@/lib/user-profile";
import type { ActionResult } from "@/lib/action-result";

// ==========================================================================
// R6 Phase F — Grant/Revoke App Access — เฉพาะ Owner (isOwner=true จาก DB สด) เท่านั้น
// ห้ามผูกกับ Role/Permission เดิม (OWNER_ADMIN/user.manage ไม่ได้สิทธิ์นี้อัตโนมัติ
// ตาม Requirement ตรงๆ) — ทุกการเปลี่ยนแปลงบันทึก AuditLog ครบ: actor / target /
// app / before / after / timestamp (createdAt ของ AuditLog เดิม)
// ==========================================================================

async function requireOwner() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("UNAUTHORIZED");
  // อ่าน isOwner สดจาก DB เสมอ — ไม่เชื่อค่าใดๆ ใน JWT/Session (Flag นี้ไม่เคยถูก Cache)
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, isOwner: true, active: true, username: true } });
  if (!user || !user.active || !user.isOwner) throw new Error("FORBIDDEN");
  return user;
}

/** ตั้งชุดสิทธิ์ App Access ของ User ปลายทางให้ตรงกับ desiredAppIds (Server คำนวณ
 * Diff เองจากสถานะจริงใน DB — Grant ส่วนที่ขาด / Revoke ส่วนที่เกิน — Atomic ทั้งชุด) */
export async function updateUserAppAccess(targetUserId: string, formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();

  // ห้ามแก้สิทธิ์ตัวเอง (กัน Owner ล็อกตัวเองออกจาก Portal/Access Management) และห้ามแก้
  // สิทธิ์ของ Owner คนอื่น (Owner เข้าได้ทุกแอพโดยปริยายอยู่แล้ว — แถว UserAppAccess ของ
  // Owner ไม่มีความหมาย การเปิดให้แก้มีแต่ชวนให้เข้าใจผิด)
  if (targetUserId === owner.id) {
    return { success: false, error: "ไม่สามารถแก้ไขสิทธิ์ของตัวเองได้" };
  }
  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true, username: true, isOwner: true } });
  if (!target) return { success: false, error: "ไม่พบผู้ใช้" };
  if (target.isOwner) return { success: false, error: "เจ้าของกิจการเข้าได้ทุกแอปพลิเคชันอยู่แล้ว — ไม่ต้องกำหนดสิทธิ์" };

  const grantableIds = new Set(getGrantableApps().map((a) => a.id));
  const desired = new Set(
    formData
      .getAll("appIds")
      .map(String)
      .filter((id) => grantableIds.has(id)) // Defense-in-depth: id นอก Registry/ownerOnly ถูกทิ้งเงียบๆ
  );

  const currentRows = await db.userAppAccess.findMany({ where: { userId: targetUserId }, select: { appId: true } });
  const current = new Set(currentRows.map((r) => r.appId));

  const toGrant = [...desired].filter((id) => !current.has(id));
  const toRevoke = [...current].filter((id) => grantableIds.has(id) && !desired.has(id));

  if (toGrant.length === 0 && toRevoke.length === 0) {
    return { success: true };
  }

  await db.$transaction(async (tx) => {
    for (const appId of toGrant) {
      await tx.userAppAccess.create({ data: { userId: targetUserId, appId, grantedById: owner.id } });
      await tx.auditLog.create({
        data: {
          userId: owner.id,
          action: "GRANT_APP_ACCESS",
          module: "AppAccess",
          recordId: targetUserId,
          newValue: { targetUsername: target.username, appId, before: false, after: true },
        },
      });
    }
    for (const appId of toRevoke) {
      await tx.userAppAccess.deleteMany({ where: { userId: targetUserId, appId } });
      await tx.auditLog.create({
        data: {
          userId: owner.id,
          action: "REVOKE_APP_ACCESS",
          module: "AppAccess",
          recordId: targetUserId,
          newValue: { targetUsername: target.username, appId, before: true, after: false },
        },
      });
    }
  });

  // ล้าง Cache ทั้ง Layout ให้ Portal/Route Guard ของทุกหน้าเห็นสิทธิ์ใหม่ทันที
  revalidatePath("/", "layout");
  return { success: true };
}

/** Owner UAT — Password ถูก Hash แบบ bcrypt (One-way) ตั้งแต่ตอน Set จึงไม่มีทาง
 * "ดูรหัสผ่านปัจจุบัน" ได้จริงโดยไม่เก็บ Plain Text ซึ่งขัดนโยบายความปลอดภัยเดิมของระบบ
 * (auth.ts ข้อ 51) — ใช้ Owner-initiated Password Reset แทน: Owner ตั้งรหัสผ่านใหม่ให้ User
 * ที่ลืมรหัสได้ทันทีโดยไม่ต้องรู้รหัสเดิม (เทียบเท่าการ "กู้สิทธิ์เข้าใช้งาน" ในทางปฏิบัติ) —
 * Exclude ตัวเอง/Owner คนอื่น ตาม Pattern เดียวกับ updateUserAppAccess */
export async function resetUserPassword(targetUserId: string, formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();

  if (targetUserId === owner.id) {
    return { success: false, error: "กรุณาใช้หน้า My Profile เพื่อเปลี่ยนรหัสผ่านของตัวเอง" };
  }
  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true, username: true, isOwner: true, active: true } });
  if (!target) return { success: false, error: "ไม่พบผู้ใช้" };
  if (target.isOwner) return { success: false, error: "ไม่สามารถตั้งรหัสผ่านให้เจ้าของกิจการคนอื่นได้" };

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const check = validateNewPassword(newPassword, confirmPassword);
  if (!check.valid) {
    return { success: false, error: check.error, fieldErrors: { newPassword: check.error } };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.$transaction([
    db.user.update({ where: { id: targetUserId }, data: { passwordHash } }),
    db.auditLog.create({
      data: {
        userId: owner.id,
        action: "RESET_PASSWORD",
        module: "UserProfile",
        recordId: targetUserId,
        // ห้าม Log ค่ารหัสผ่าน/Hash ใดๆ — บันทึกแค่ metadata ว่ามีการ Reset
        newValue: { targetUsername: target.username, reset: true },
      },
    }),
  ]);

  return { success: true, message: `ตั้งรหัสผ่านใหม่ให้ ${target.username} สำเร็จ` };
}
