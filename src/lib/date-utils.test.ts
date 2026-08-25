import { describe, it, expect } from "vitest";
import { startOfMonth, endOfCurrentMonth } from "./date-utils";

describe("startOfMonth", () => {
  it("คืนวันที่ 1 ของเดือนที่ส่งเข้ามาเสมอ ไม่ใช่วันปัจจุบัน", () => {
    expect(startOfMonth(new Date(2026, 7, 20))).toBe("2026-08-01");
  });
});

// ข้อ 1 (Dashboard Requirement): ต้องคำนวณวันสุดท้ายของเดือนจริง ไม่ hardcode 30/31
describe("endOfCurrentMonth", () => {
  it("มกราคม (31 วัน)", () => {
    expect(endOfCurrentMonth(new Date(2026, 0, 20))).toBe("2026-01-31");
  });

  it("เมษายน (30 วัน)", () => {
    expect(endOfCurrentMonth(new Date(2026, 3, 1))).toBe("2026-04-30");
  });

  it("กุมภาพันธ์ ปีปกติ (28 วัน) — 2026 ไม่ใช่ปีอธิกสุรทิน", () => {
    expect(endOfCurrentMonth(new Date(2026, 1, 5))).toBe("2026-02-28");
  });

  it("กุมภาพันธ์ ปีอธิกสุรทิน (29 วัน) — 2028 หารด้วย 4 ลงตัว", () => {
    expect(endOfCurrentMonth(new Date(2028, 1, 5))).toBe("2028-02-29");
  });

  it("สิงหาคม (31 วัน) แม้วันนี้ยังไม่ถึงสิ้นเดือน", () => {
    expect(endOfCurrentMonth(new Date(2026, 7, 20))).toBe("2026-08-31");
  });

  it("ธันวาคม ต้องไม่ overflow ข้ามปี", () => {
    expect(endOfCurrentMonth(new Date(2026, 11, 15))).toBe("2026-12-31");
  });
});

// Stabilization — Invalid URL date param must fall back instead of crashing the page
import { safeDateParam } from "./date-utils";
describe("safeDateParam", () => {
  it("passes valid YYYY-MM-DD through unchanged", () => {
    expect(safeDateParam("2026-08-23", "FALLBACK")).toBe("2026-08-23");
  });
  it("falls back on missing, malformed, impossible and overflowing dates", () => {
    expect(safeDateParam(undefined, "F")).toBe("F");
    expect(safeDateParam("", "F")).toBe("F");
    expect(safeDateParam("not-a-date", "F")).toBe("F");
    expect(safeDateParam("2026-99-99", "F")).toBe("F");
    expect(safeDateParam("2026-02-31", "F")).toBe("F"); // JS would silently roll to Mar 3
    expect(safeDateParam("23/08/2026", "F")).toBe("F");
  });
});

// Production Prep (Timezone Audit) — "วันนี้" ของฟอร์มต้องเป็นวันที่ Local ไม่ใช่ UTC
import { todayInputValue } from "./date-utils";
import { vi } from "vitest";
describe("todayInputValue (local-date form default)", () => {
  it("อ่านวันที่จาก Local Getters เสมอ (ไม่ผ่าน toISOString/UTC)", () => {
    vi.useFakeTimers();
    // 17:30 UTC = 00:30 ของ "วันถัดไป" ในโซนที่ล้ำหน้า UTC ≥ 6.5 ชม. (เช่นไทย +7)
    vi.setSystemTime(new Date("2026-08-24T17:30:00Z"));
    const d = new Date();
    const expectedLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(todayInputValue()).toBe(expectedLocal);
    // ใน TZ ที่ล้ำหน้า UTC (ไทย) ค่า Local ต้อง "ไม่เท่ากับ" ค่า UTC ที่เคยใช้ผิด
    if (d.getTimezoneOffset() < 0) {
      expect(todayInputValue()).not.toBe(d.toISOString().slice(0, 10));
    }
    vi.useRealTimers();
  });
});
