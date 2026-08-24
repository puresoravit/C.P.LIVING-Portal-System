import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isRateLimited, recordFailedAttempt, resetAttempts, isOverLimit } from "./rate-limit";

describe("rate-limit (ป้องกัน brute-force login — ข้อ 51)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ยังไม่ถูก rate limit ถ้าไม่เคยลองผิดเลย", () => {
    expect(isRateLimited("user-a")).toBe(false);
  });

  it("ล็อกหลังพยายามผิดครบ 5 ครั้งภายใน window เดียวกัน", () => {
    for (let i = 0; i < 4; i++) recordFailedAttempt("user-b");
    expect(isRateLimited("user-b")).toBe(false);
    recordFailedAttempt("user-b");
    expect(isRateLimited("user-b")).toBe(true);
  });

  it("resetAttempts ปลดล็อกทันที (ใช้ตอน login สำเร็จ)", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt("user-c");
    expect(isRateLimited("user-c")).toBe(true);
    resetAttempts("user-c");
    expect(isRateLimited("user-c")).toBe(false);
  });

  it("นับแยกกันคนละ key (username) — ไม่ปนกัน", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt("user-d");
    expect(isRateLimited("user-d")).toBe(true);
    expect(isRateLimited("user-e")).toBe(false);
  });

  it("ปลดล็อกอัตโนมัติเมื่อพ้น window (15 นาที)", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt("user-f");
    expect(isRateLimited("user-f")).toBe(true);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(isRateLimited("user-f")).toBe(false);
  });

  // Production Readiness (Phase 2) — Fixed-window Limiter แบบกำหนดค่าได้ (isOverLimit)
  describe("isOverLimit (generic endpoint limiter)", () => {
    it("อนุญาตจนถึงเพดาน แล้วบล็อกครั้งถัดไปใน window เดียวกัน", () => {
      for (let i = 0; i < 3; i++) expect(isOverLimit("ep-a", 3, 60_000)).toBe(false);
      expect(isOverLimit("ep-a", 3, 60_000)).toBe(true);
    });

    it("นับแยกคนละ key", () => {
      for (let i = 0; i < 4; i++) isOverLimit("ep-b", 3, 60_000);
      expect(isOverLimit("ep-b", 3, 60_000)).toBe(true);
      expect(isOverLimit("ep-c", 3, 60_000)).toBe(false);
    });

    it("รีเซ็ตเมื่อพ้น window", () => {
      for (let i = 0; i < 4; i++) isOverLimit("ep-d", 3, 60_000);
      expect(isOverLimit("ep-d", 3, 60_000)).toBe(true);
      vi.advanceTimersByTime(60_001);
      expect(isOverLimit("ep-d", 3, 60_000)).toBe(false);
    });

    it("ไม่ปนกับ limiter ของ login (คนละ Map)", () => {
      for (let i = 0; i < 10; i++) isOverLimit("shared-key", 3, 60_000);
      expect(isRateLimited("shared-key")).toBe(false);
    });
  });
});
