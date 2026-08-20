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
