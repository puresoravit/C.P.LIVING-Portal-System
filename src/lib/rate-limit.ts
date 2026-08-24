// ---------------------------------------------------------------
// In-memory rate limiter สำหรับ login (ป้องกัน brute-force)
// ตั้งใจให้เป็น in-memory ล้วนๆ ไม่ผูกกับ Redis/vendor ใด — เหมาะกับ
// deployment แบบ single-instance ตอนนี้ ถ้าอนาคต scale เป็นหลาย instance
// ต้องย้ายไป shared store (เช่น Redis) แทน เพราะ Map นี้แยกกันคนละ process
// ---------------------------------------------------------------

const WINDOW_MS = 15 * 60 * 1000; // 15 นาที
const MAX_ATTEMPTS = 5;

type Entry = { count: number; windowStart: number };

const attempts = new Map<string, Entry>();

function isExpired(entry: Entry): boolean {
  return Date.now() - entry.windowStart > WINDOW_MS;
}

export function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry || isExpired(entry)) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string): void {
  const entry = attempts.get(key);
  if (!entry || isExpired(entry)) {
    attempts.set(key, { count: 1, windowStart: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function resetAttempts(key: string): void {
  attempts.delete(key);
}

// ---------------------------------------------------------------
// Production Readiness (Phase 2) — Fixed-window Limiter แบบกำหนดค่าได้ สำหรับ
// Endpoint อื่นที่ไม่ใช่ Login (เช่น /api/auth/passkey/options ที่เปิด Pre-auth
// โดยจำเป็น) — แยก Map จากตัว Login ข้างบนโดยสิ้นเชิง (คนละ Semantic: ข้างบนนับ
// "ความล้มเหลว" ตัวนี้นับ "จำนวนครั้งที่เรียก") — In-memory เช่นเดิม เหมาะกับ
// Single-instance Deployment ของระบบนี้
// ---------------------------------------------------------------

const usage = new Map<string, Entry>();

/** นับการเรียก 1 ครั้งแล้วตอบว่าเกินโควตาของหน้าต่างเวลานี้หรือยัง (Atomic ในตัว) */
export function isOverLimit(key: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = usage.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    usage.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > maxPerWindow;
}
