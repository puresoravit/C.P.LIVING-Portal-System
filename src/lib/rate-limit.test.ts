import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isRateLimited, recordFailedAttempt, resetAttempts } from "./rate-limit";

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
});
