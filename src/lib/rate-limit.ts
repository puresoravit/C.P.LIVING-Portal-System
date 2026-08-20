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
