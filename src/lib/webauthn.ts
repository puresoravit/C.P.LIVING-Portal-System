import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { resolveRpConfig, CHALLENGE_TTL_MS, isChallengeUsable } from "@/lib/webauthn-config";

// ==========================================================================
// Phase G — Passkey/WebAuthn Service (Server-only) — ห่อ @simplewebauthn/server (Library
// ที่ Maintained/MIT/มาตรฐาน) ไม่เขียน Crypto/Verification เอง — หน้าที่ของไฟล์นี้คือ
// "Challenge Lifecycle + Credential Storage" รอบๆ Library เท่านั้น:
//
// Challenge: สุ่มโดย Library (32 bytes CSPRNG) → เก็บแถวใน DB พร้อม expiresAt (2 นาที) +
// type + userId (เฉพาะ Registration) → คืน challengeId (cuid ทึบ) ให้ Client ถือไว้ →
// ตอน Verify: consumeChallenge() ลบแถวแบบ Atomic (deleteMany WHERE id — count=1 แปลว่าเรา
// เป็นคนแรกที่ใช้; Request ซ้อนที่ใช้ challengeId เดิมได้ count=0 → ปฏิเสธ = Single-use/
// Replay-safe) แล้วตรวจ expiry/type/userId ด้วย isChallengeUsable() — Client ไม่เคยส่ง
// ค่า Challenge จริงกลับมาให้เชื่อ (ส่งแค่ id, ค่า Challenge ถูก Library เทียบจาก
// clientDataJSON ที่ Authenticator เซ็นมากับ expectedChallenge ที่อ่านจาก DB ฝั่งเรา)
//
// ไม่มี Biometric Data/Private Key ผ่านมาทางนี้เลยตาม Spec — Server เห็นแค่ Public Key +
// Signature + Metadata
// ==========================================================================

const CHALLENGE_REGISTRATION = "registration";
const CHALLENGE_AUTHENTICATION = "authentication";

async function sweepExpiredChallenges() {
  // กวาดแถวหมดอายุทุกครั้งที่ออก Challenge ใหม่ — ตารางจึงไม่โตเรื่อยๆ โดยไม่ต้องมี Cron
  await db.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

async function storeChallenge(challenge: string, type: string, userId: string | null): Promise<string> {
  await sweepExpiredChallenges();
  const row = await db.webAuthnChallenge.create({
    data: { challenge, type, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
  return row.id;
}

/** ดึง+ลบ Challenge แบบ Atomic — ใช้ได้ครั้งเดียวเท่านั้น คืน null ถ้าไม่มี/ถูกใช้ไปแล้ว/หมดอายุ/
 * ไม่ตรง type หรือ userId ที่คาดหวัง */
async function consumeChallenge(challengeId: string, expected: { type: string; userId: string | null }): Promise<string | null> {
  if (!challengeId || typeof challengeId !== "string") return null;
  const row = await db.webAuthnChallenge.findUnique({ where: { id: challengeId } });
  if (!row) return null;
  // ลบก่อนตรวจเสมอ — แม้แถวจะใช้ไม่ได้ (หมดอายุ/ผิด type) ก็ไม่ควรเหลือให้ลองซ้ำ
  const deleted = await db.webAuthnChallenge.deleteMany({ where: { id: challengeId } });
  if (deleted.count !== 1) return null; // แพ้ Race ให้ Request อื่นที่ใช้ Challenge เดียวกัน
  if (!isChallengeUsable(row, expected)) return null;
  return row.challenge;
}

function toTransports(raw: string[]): AuthenticatorTransportFuture[] {
  return raw as AuthenticatorTransportFuture[];
}

// ---------------------------------------------------------------------------
// Registration (ต้อง Login แล้ว — Caller ส่ง userId จาก Session เท่านั้น ห้ามรับจาก Client)
// ---------------------------------------------------------------------------
export async function beginRegistration(user: { id: string; username: string; displayName: string }) {
  const { rpID, rpName } = resolveRpConfig();
  const existing = await db.webAuthnCredential.findMany({ where: { userId: user.id }, select: { id: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userDisplayName: user.displayName,
    // userID = user.id ของเรา (Authenticator ส่งกลับมาเป็น userHandle ตอน Login แบบ
    // Usernameless ให้เรารู้ว่าเป็นใคร) — ห้ามใช้ Username ตรงๆ ตาม Spec (PII)
    userID: new TextEncoder().encode(user.id),
    attestationType: "none", // ไม่ต้องการ Attestation Chain ของผู้ผลิต — แค่ Public Key ก็พอ (Privacy-friendly, มาตรฐานสำหรับ Passkey)
    // กันลงทะเบียน Authenticator เดิมซ้ำ (OS จะบอกผู้ใช้ว่า "มีอยู่แล้ว")
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: toTransports(c.transports) })),
    authenticatorSelection: {
      residentKey: "required", // Discoverable Credential = Passkey จริง (Login ได้โดยไม่พิมพ์ Username)
      userVerification: "required", // ต้องมี Biometric/PIN ของเครื่อง ไม่ใช่แค่แตะ
    },
  });
  const challengeId = await storeChallenge(options.challenge, CHALLENGE_REGISTRATION, user.id);
  return { options, challengeId };
}

export async function finishRegistration(
  userId: string,
  challengeId: string,
  response: RegistrationResponseJSON,
  label: string
): Promise<{ ok: true; credentialId: string } | { ok: false; error: string }> {
  const { rpID, origin } = resolveRpConfig();
  const expectedChallenge = await consumeChallenge(challengeId, { type: CHALLENGE_REGISTRATION, userId });
  if (!expectedChallenge) return { ok: false, error: "Challenge หมดอายุหรือถูกใช้ไปแล้ว — กรุณาลองใหม่" };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    return { ok: false, error: `ตรวจสอบ Passkey ไม่ผ่าน: ${err instanceof Error ? err.message : "unknown"}` };
  }
  if (!verification.verified || !verification.registrationInfo) return { ok: false, error: "ตรวจสอบ Passkey ไม่ผ่าน" };

  const info = verification.registrationInfo;
  // credentialID ต้อง Unique ทั้งระบบ — ถ้าซ้ำ (ทฤษฎี: Authenticator ตัวเดียวกันถูกลงทะเบียนให้
  // User อื่น) ปฏิเสธ ไม่ย้ายเจ้าของเงียบๆ
  const clash = await db.webAuthnCredential.findUnique({ where: { id: info.credential.id }, select: { userId: true } });
  if (clash) return { ok: false, error: "Passkey นี้ถูกลงทะเบียนไว้แล้ว" };

  await db.webAuthnCredential.create({
    data: {
      id: info.credential.id,
      userId,
      publicKey: Buffer.from(info.credential.publicKey),
      counter: BigInt(info.credential.counter),
      transports: info.credential.transports ?? [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      label: label.trim() || "Passkey",
    },
  });
  return { ok: true, credentialId: info.credential.id };
}

// ---------------------------------------------------------------------------
// Authentication (ยังไม่มี Session — Usernameless/Discoverable: ไม่ต้องรู้ว่าใครจนกว่า
// Authenticator จะตอบ credentialId กลับมา)
// ---------------------------------------------------------------------------
export async function beginAuthentication() {
  const { rpID } = resolveRpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    // allowCredentials ว่าง = ให้ OS แสดง Passkey ทุกตัวของ RP นี้ที่มีในเครื่อง (Discoverable)
    allowCredentials: [],
  });
  const challengeId = await storeChallenge(options.challenge, CHALLENGE_AUTHENTICATION, null);
  return { options, challengeId };
}

export type PasskeyAuthResult =
  | { ok: true; user: { id: string; username: string; displayName: string; email: string | null; role: string }; credentialId: string }
  | { ok: false; reason: "challenge" | "unknown_credential" | "user_inactive" | "verification_failed"; credentialId?: string };

export async function finishAuthentication(challengeId: string, response: AuthenticationResponseJSON): Promise<PasskeyAuthResult> {
  const { rpID, origin } = resolveRpConfig();
  const expectedChallenge = await consumeChallenge(challengeId, { type: CHALLENGE_AUTHENTICATION, userId: null });
  if (!expectedChallenge) return { ok: false, reason: "challenge" };

  // response.id = credentialId (base64url) ที่ Authenticator เลือกใช้ — หา Credential ของเรา
  const cred = await db.webAuthnCredential.findUnique({ where: { id: response.id }, include: { user: true } });
  if (!cred) return { ok: false, reason: "unknown_credential", credentialId: response.id }; // รวมถึง Credential ที่ถูก Revoke ไปแล้ว (แถวหายไป)
  if (!cred.user.active) return { ok: false, reason: "user_inactive", credentialId: cred.id };

  // userHandle ที่ Authenticator ส่งมาต้องตรงกับเจ้าของ Credential ใน DB (กัน Credential
  // Substitution — Library ไม่ได้เช็คข้อนี้ให้ เพราะไม่รู้ Mapping ของเรา)
  if (response.response.userHandle) {
    const handle = Buffer.from(response.response.userHandle, "base64url").toString();
    if (handle !== cred.userId) return { ok: false, reason: "verification_failed", credentialId: cred.id };
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.id,
        publicKey: new Uint8Array(cred.publicKey),
        counter: Number(cred.counter),
        transports: toTransports(cred.transports),
      },
    });
  } catch {
    return { ok: false, reason: "verification_failed", credentialId: cred.id };
  }
  if (!verification.verified) return { ok: false, reason: "verification_failed", credentialId: cred.id };

  // signCount: Library ตรวจแล้วว่า newCounter > เดิม (หรือทั้งคู่เป็น 0 สำหรับ Passkey แบบ Sync
  // ที่ไม่นับ) — บันทึกค่าใหม่ + lastUsedAt
  await db.webAuthnCredential.update({
    where: { id: cred.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });

  return {
    ok: true,
    credentialId: cred.id,
    user: { id: cred.user.id, username: cred.user.username, displayName: cred.user.displayName, email: cred.user.email, role: cred.user.role },
  };
}

/** ย่อ credentialId สำหรับ Audit/Log — พอให้อ้างอิงได้ ไม่ใช่ค่าเต็มที่ใช้ Login ได้จริง */
export function safeCredentialRef(credentialId: string): string {
  return credentialId.length <= 12 ? credentialId : `${credentialId.slice(0, 8)}…${credentialId.slice(-4)}`;
}
