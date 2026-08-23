"use server";

import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import { resolveTitlePrefix, validateAvatarDataUri, validateNewPassword } from "@/lib/user-profile";

// ==========================================================================
// R6 Phase F — Owner UAT: My Profile — User แก้ไขข้อมูลของ "ตัวเอง" เท่านั้น
// (ผูก userId จาก Session เสมอ ไม่รับ Target User ID จาก Client แม้แต่ Field เดียว —
// กันช่องทางแก้ Profile คนอื่น) — แก้ได้เฉพาะ titlePrefix/displayName/avatarDataUri +
// เปลี่ยนรหัสผ่านตัวเอง — Role/isOwner/App Access ไม่มี Field ให้แก้จากหน้านี้เลย
// (Reuse Permission Matrix/App Access เดิมทั้งหมด ไม่มี Path ไหนใน Action นี้แตะ 2 เรื่อง
// นั้น)
// ==========================================================================

async function requireSelf() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("UNAUTHORIZED");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, active: true } });
  if (!user || !user.active) throw new Error("UNAUTHORIZED");
  return user;
}

const profileSchema = z.object({
  titlePrefix: z.union([z.enum(["MR", "MS"]), z.literal("")]),
  displayName: z.string().trim().min(1, "กรุณากรอกชื่อที่แสดง"),
});

/** Draft → Save เดียวกับหน้าอื่นในระบบ (Designer ฯลฯ) — Client ส่งค่าที่ "จะให้เป็น" มา
 * ทีเดียวตอนกด Save Changes เท่านั้น (ไม่มี Auto-save ระหว่างแก้ฟอร์ม/Crop รูป) —
 * avatarAction แยก 3 สถานะชัดเจน กัน Save ปกติ (ไม่ได้แตะรูป) ไปเขียนทับรูปเดิมโดยไม่ตั้งใจ */
export async function updateMyProfile(formData: FormData): Promise<ActionResult> {
  const self = await requireSelf();

  const raw = profileSchema.safeParse({
    titlePrefix: String(formData.get("titlePrefix") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }

  const avatarAction = String(formData.get("avatarAction") ?? "keep");
  let avatarUpdate: { avatarDataUri: string | null } | {} = {};
  if (avatarAction === "remove") {
    avatarUpdate = { avatarDataUri: null };
  } else if (avatarAction === "set") {
    const dataUri = String(formData.get("avatarDataUri") ?? "");
    const check = validateAvatarDataUri(dataUri);
    if (!check.valid) return { success: false, error: check.error };
    avatarUpdate = { avatarDataUri: dataUri };
  }

  await db.user.update({
    where: { id: self.id },
    data: {
      titlePrefix: resolveTitlePrefix(raw.data.titlePrefix) ?? null,
      displayName: raw.data.displayName,
      ...avatarUpdate,
    },
  });

  // Audit ไม่เก็บตัว Data URI จริง (รูปภาพ) — เก็บแค่ว่ามีการเปลี่ยนรูปหรือไม่ กัน Audit
  // Log บวมจาก Base64 ก้อนใหญ่โดยไม่มีประโยชน์เชิงตรวจสอบเพิ่มจากนี้
  await db.auditLog.create({
    data: {
      userId: self.id,
      action: "UPDATE",
      module: "UserProfile",
      recordId: self.id,
      newValue: { titlePrefix: raw.data.titlePrefix || null, displayName: raw.data.displayName, avatarAction },
    },
  });

  revalidatePath("/", "layout");
  return { success: true, message: "บันทึกโปรไฟล์สำเร็จ" };
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "กรุณากรอกรหัสผ่านปัจจุบัน"),
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .refine((v) => validateNewPassword(v.newPassword, v.confirmPassword).valid, {
    message: "รหัสผ่านใหม่ไม่ถูกต้อง",
    path: ["newPassword"],
  });

/** เปลี่ยนรหัสผ่านของตัวเอง — ต้องกรอกรหัสผ่านปัจจุบันถูกต้องก่อนเสมอ (Standard
 * Self-service Pattern — ต่างจาก Owner Reset Password ที่ไม่ต้องรู้รหัสเดิมของคนอื่น
 * ดู portal/access/actions.ts) — Hash ด้วย bcrypt เดียวกับที่ authorize() ใช้ตรวจ ไม่มี
 * Auth Architecture ใหม่ */
export async function changeMyPassword(formData: FormData): Promise<ActionResult> {
  const self = await requireSelf();

  const raw = changePasswordSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!raw.success) {
    const check = validateNewPassword(String(formData.get("newPassword") ?? ""), String(formData.get("confirmPassword") ?? ""));
    return { success: false, error: check.valid ? "กรุณาตรวจสอบข้อมูลที่กรอก" : check.error };
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: self.id }, select: { passwordHash: true } });
  const currentOk = await bcrypt.compare(raw.data.currentPassword, user.passwordHash);
  if (!currentOk) {
    return { success: false, error: "รหัสผ่านปัจจุบันไม่ถูกต้อง", fieldErrors: { currentPassword: "รหัสผ่านปัจจุบันไม่ถูกต้อง" } };
  }

  const newHash = await bcrypt.hash(raw.data.newPassword, 10);
  await db.user.update({ where: { id: self.id }, data: { passwordHash: newHash } });

  // ไม่เก็บรหัสผ่าน (เก่า/ใหม่) ใน Audit Log แม้แต่ Hash — บันทึกแค่ว่ามีการเปลี่ยนแปลงจริง
  await db.auditLog.create({
    data: { userId: self.id, action: "CHANGE_PASSWORD", module: "UserProfile", recordId: self.id, newValue: { changed: true } },
  });

  return { success: true, message: "เปลี่ยนรหัสผ่านสำเร็จ" };
}
