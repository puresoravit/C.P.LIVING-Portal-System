"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { ActionResult } from "@/lib/action-result";
import { beginRegistration, finishRegistration, safeCredentialRef } from "@/lib/webauthn";

// ==========================================================================
// Phase G — Passkey Management (My Profile → Security / Passkeys) — "ของตัวเอง" เท่านั้น:
// ทุก Action ผูก userId จาก Session (requireSelf) ไม่รับ Target User จาก Client แม้แต่ Field
// เดียว — Rename/Remove ใช้ where { id, userId: self } ให้ DB เป็นคนตัดสิน (count=0 = ไม่ใช่
// ของคุณ/ไม่มี) — Pattern เดียวกับ profile/actions.ts ทุกประการ
// ==========================================================================

async function requireSelf() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("UNAUTHORIZED");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, username: true, displayName: true, active: true } });
  if (!user || !user.active) throw new Error("UNAUTHORIZED");
  return user;
}

const LABEL_MAX = 60;
function cleanLabel(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, LABEL_MAX);
}

/** ขั้นที่ 1 ของการลงทะเบียน — ออก Options+Challenge ผูกกับ User ที่ Login อยู่ */
export async function beginPasskeyRegistration() {
  const self = await requireSelf();
  return beginRegistration(self);
}

/** ขั้นที่ 2 — รับผลจาก Authenticator (ผ่าน OS Prompt จริง) มา Verify ฝั่ง Server แล้วบันทึก */
export async function finishPasskeyRegistration(input: { challengeId: string; response: RegistrationResponseJSON; label: string }): Promise<ActionResult> {
  const self = await requireSelf();
  const label = cleanLabel(input?.label) || "Passkey";
  const result = await finishRegistration(self.id, String(input?.challengeId ?? ""), input?.response, label);
  if (!result.ok) return { success: false, error: result.error };

  await db.auditLog.create({
    data: {
      userId: self.id,
      action: "PASSKEY_REGISTERED",
      module: "Auth",
      recordId: self.id,
      newValue: { credentialRef: safeCredentialRef(result.credentialId), label },
    },
  });
  revalidatePath("/portal/profile");
  return { success: true, message: `เพิ่ม Passkey "${label}" สำเร็จ` };
}

export async function renamePasskey(credentialId: string, formData: FormData): Promise<ActionResult> {
  const self = await requireSelf();
  const label = cleanLabel(formData.get("label"));
  if (!label) return { success: false, error: "กรุณากรอกชื่อ Passkey" };
  const updated = await db.webAuthnCredential.updateMany({ where: { id: credentialId, userId: self.id }, data: { label } });
  if (updated.count !== 1) return { success: false, error: "ไม่พบ Passkey นี้" };
  await db.auditLog.create({
    data: { userId: self.id, action: "PASSKEY_RENAMED", module: "Auth", recordId: self.id, newValue: { credentialRef: safeCredentialRef(credentialId), label } },
  });
  revalidatePath("/portal/profile");
  return { success: true, message: "เปลี่ยนชื่อ Passkey สำเร็จ" };
}

export async function removePasskey(credentialId: string): Promise<ActionResult> {
  const self = await requireSelf();
  const existing = await db.webAuthnCredential.findFirst({ where: { id: credentialId, userId: self.id }, select: { label: true } });
  if (!existing) return { success: false, error: "ไม่พบ Passkey นี้" };
  // ลบแถวจริง (Revoke) — Credential นี้ Login ไม่ได้อีกทันที (finishAuthentication หาไม่เจอ
  // → unknown_credential) — Credential อื่นของ User เดียวกันไม่ถูกแตะ — Password Login ยัง
  // ใช้ได้เสมอ Passkey ไม่ใช่ Single Point of Failure
  const deleted = await db.webAuthnCredential.deleteMany({ where: { id: credentialId, userId: self.id } });
  if (deleted.count !== 1) return { success: false, error: "ไม่พบ Passkey นี้" };
  await db.auditLog.create({
    data: { userId: self.id, action: "PASSKEY_REMOVED", module: "Auth", recordId: self.id, newValue: { credentialRef: safeCredentialRef(credentialId), label: existing.label } },
  });
  revalidatePath("/portal/profile");
  return { success: true, message: `ลบ Passkey "${existing.label}" แล้ว` };
}
