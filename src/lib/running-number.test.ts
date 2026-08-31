import { describe, it, expect } from "vitest";
import { currentPeriod, formatDocNumber } from "./running-number";

describe("running-number formatting (ข้อ 30)", () => {
  it("currentPeriod คืนค่ารูปแบบ YYYYMM", () => {
    expect(currentPeriod(new Date("2026-08-19"))).toBe("202608");
    expect(currentPeriod(new Date("2026-01-05"))).toBe("202601");
  });

  it("formatDocNumber ตรงตามตัวอย่างในข้อ 22: ORDER 5 หลัก, INV-A 4 หลัก", () => {
    expect(formatDocNumber("ORDER", "202608", 125, 5)).toBe("ORDER-202608-00125");
    expect(formatDocNumber("INV-A", "202608", 81, 4)).toBe("INV-A-202608-0081");
    expect(formatDocNumber("INV-B", "202608", 44, 4)).toBe("INV-B-202608-0044");
  });
});
