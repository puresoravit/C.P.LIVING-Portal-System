// ==========================================================================
// Phase G — WebAuthn Relying Party Configuration (Pure — ไม่แตะ DB, Unit Test ได้)
//
// RP ID / Origin "ต้อง" ตรงกับที่ Browser เห็นจริง ไม่งั้น Authenticator ปฏิเสธ/Server
// Verify ไม่ผ่าน — Resolve จาก Environment เท่านั้น ห้าม Hardcode Domain ใน Auth Code:
//   WEBAUTHN_RP_ID   (Optional) — Default = hostname ของ NEXTAUTH_URL
//   WEBAUTHN_ORIGIN  (Optional) — Default = origin ของ NEXTAUTH_URL
//   WEBAUTHN_RP_NAME (Optional) — ชื่อที่ OS Prompt โชว์ให้ผู้ใช้เห็น
// Dev: NEXTAUTH_URL=http://localhost:3000 → rpID "localhost" + origin http://localhost:3000
// (WebAuthn Spec อนุญาต localhost แบบ http เป็นกรณีพิเศษ ไม่ต้องลด Security ใดๆ)
// Prod: ต้องเป็น HTTPS + Domain จริง (Browser บังคับเอง Secure Context) — ถ้า Deploy บน
// Sub-domain หลายตัว ตั้ง WEBAUTHN_RP_ID เป็น Registrable Domain แม่ได้ตาม Spec
// ==========================================================================

export type WebAuthnRpConfig = { rpID: string; origin: string; rpName: string };

export function resolveRpConfig(env: NodeJS.ProcessEnv = process.env): WebAuthnRpConfig {
  const base = env.NEXTAUTH_URL;
  if (!base) throw new Error("NEXTAUTH_URL is required to derive the WebAuthn RP ID/origin");
  const url = new URL(base);
  const origin = env.WEBAUTHN_ORIGIN ?? url.origin;
  const rpID = env.WEBAUTHN_RP_ID ?? url.hostname;
  // RP ID ต้องเป็น Domain ที่ Origin เป็นสมาชิก (เท่ากัน หรือ Origin เป็น Sub-domain ของมัน)
  // ตรวจตั้งแต่ Boot กันตั้ง Env ผิดแล้วไปพังเงียบๆ ตอน Verify
  const originHost = new URL(origin).hostname;
  if (originHost !== rpID && !originHost.endsWith(`.${rpID}`)) {
    throw new Error(`WEBAUTHN_RP_ID "${rpID}" is not a registrable suffix of origin host "${originHost}"`);
  }
  return { rpID, origin, rpName: env.WEBAUTHN_RP_NAME ?? "C.P. LIVING Billing" };
}

/** Challenge มีอายุสั้น — นานพอให้ผู้ใช้ทำ Biometric Prompt เสร็จ (สแกนพลาดซ้ำได้) แต่ไม่
 * นานพอให้เอาไป Replay ทีหลัง */
export const CHALLENGE_TTL_MS = 2 * 60 * 1000;

/** ตรวจว่าแถว Challenge ยังใช้ได้ ณ เวลา now — Pure เพื่อ Test ขอบเขตเวลาได้ */
export function isChallengeUsable(row: { expiresAt: Date; type: string; userId: string | null }, expected: { type: string; userId: string | null }, now = new Date()): boolean {
  if (row.expiresAt.getTime() <= now.getTime()) return false;
  if (row.type !== expected.type) return false;
  // Registration: ต้องเป็น Challenge ที่ออกให้ "User คนนี้" เท่านั้น (กัน Cross-user)
  // Authentication: userId เป็น null ทั้งคู่ (ยังไม่รู้ตัวตน) — ตรงกันพอดี
  if (row.userId !== expected.userId) return false;
  return true;
}
