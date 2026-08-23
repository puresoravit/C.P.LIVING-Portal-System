// ==========================================================================
// R6 Phase F — Owner UAT: My Profile / Avatar / Password Change
// Pure Functions + Constants ล้วน (ไม่แตะ DB) — Unit Test ได้ตรงๆ
// ==========================================================================

export const TITLE_PREFIX_OPTIONS = ["MR", "MS"] as const;
export type TitlePrefixKey = (typeof TITLE_PREFIX_OPTIONS)[number];
export const TITLE_PREFIX_LABELS: Record<TitlePrefixKey, string> = { MR: "Mr.", MS: "Ms." };

export function resolveTitlePrefix(raw: unknown): TitlePrefixKey | null {
  return (TITLE_PREFIX_OPTIONS as readonly string[]).includes(raw as string) ? (raw as TitlePrefixKey) : null;
}

/** ชื่อพร้อมคำนำหน้า สำหรับแสดงผลทุกจุดที่เกี่ยวกับชื่อ User (Portal Header/Welcome,
 * Billing Sidebar ฯลฯ) — จุดเดียวที่ประกอบ Prefix + ชื่อ กันแต่ละหน้ามี Logic ต่อ String
 * ซ้ำกันเอง */
export function formatDisplayName(titlePrefix: string | null, displayName: string): string {
  const prefix = resolveTitlePrefix(titlePrefix);
  return prefix ? `${TITLE_PREFIX_LABELS[prefix]} ${displayName}` : displayName;
}

// ---------------------------------------------------------------------------
// Avatar Image Validation — Pattern เดียวกับ validateLogoDataUri
// (print-template-settings.ts) ทุกประการ: PNG/JPEG/WebP เท่านั้น, ≤200KB, Reject SVG
// เสมอ (กัน XSS จาก Script ฝังใน SVG) — แยกไฟล์ต่างหากเพราะเป็นคนละ Domain (User Profile
// vs Print Template) แม้กฎจะเหมือนกัน ไม่บังคับ Import ข้าม Domain โดยไม่จำเป็น
// ---------------------------------------------------------------------------
const ALLOWED_AVATAR_MIME_TO_PREFIX: Record<string, string> = {
  "image/png": "data:image/png;base64,",
  "image/jpeg": "data:image/jpeg;base64,",
  "image/webp": "data:image/webp;base64,",
};
export const AVATAR_ALLOWED_MIME_TYPES = Object.keys(ALLOWED_AVATAR_MIME_TO_PREFIX);
export const AVATAR_MAX_BYTES = 200 * 1024;

export function validateAvatarDataUri(dataUri: string): { valid: true } | { valid: false; error: string } {
  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUri);
  if (!match) return { valid: false, error: "รูปแบบไฟล์ไม่ถูกต้อง" };

  const [, mime, base64] = match;
  if (!ALLOWED_AVATAR_MIME_TO_PREFIX[mime]) {
    return { valid: false, error: "รองรับเฉพาะไฟล์ PNG, JPEG หรือ WebP เท่านั้น" };
  }

  let byteLength: number;
  try {
    byteLength = Buffer.from(base64, "base64").length;
  } catch {
    return { valid: false, error: "ไม่สามารถอ่านไฟล์รูปได้" };
  }
  if (byteLength > AVATAR_MAX_BYTES) {
    return { valid: false, error: `ไฟล์ต้องมีขนาดไม่เกิน ${AVATAR_MAX_BYTES / 1024}KB (ไฟล์นี้ ${Math.round(byteLength / 1024)}KB)` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Password Validation — ใช้ร่วมกันทั้ง Self-service Change Password และ
// Owner-initiated Reset Password — ไม่ผูกกับ bcrypt/DB เอง (แค่ตรวจความยาว/Confirm)
// ---------------------------------------------------------------------------
export const PASSWORD_MIN_LENGTH = 8;

export function validateNewPassword(newPassword: string, confirmPassword: string): { valid: true } | { valid: false; error: string } {
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร` };
  }
  if (newPassword !== confirmPassword) {
    return { valid: false, error: "ยืนยันรหัสผ่านไม่ตรงกัน" };
  }
  return { valid: true };
}
