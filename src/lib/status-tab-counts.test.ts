import { describe, it, expect } from "vitest";
import { buildStatusTabCounts } from "./status-tab-counts";

describe("buildStatusTabCounts", () => {
  it("แม็ปจำนวนจาก groupBy เข้ากับ tab key ที่ต้องแสดงครบทุกตัว", () => {
    const result = buildStatusTabCounts(
      [
        { status: "CONFIRMED", count: 12 },
        { status: "CANCELLED", count: 3 },
      ],
      ["DRAFT", "CONFIRMED", "CANCELLED"]
    );
    expect(result).toEqual({ DRAFT: 0, CONFIRMED: 12, CANCELLED: 3 });
  });

  it("Status ที่ยังไม่มีข้อมูลเลยได้ 0 แทนที่จะหายไป", () => {
    const result = buildStatusTabCounts([], ["DRAFT", "CONFIRMED", "CANCELLED"]);
    expect(result).toEqual({ DRAFT: 0, CONFIRMED: 0, CANCELLED: 0 });
  });

  it("ไม่นับ Status ที่ไม่อยู่ใน tab key ที่กำหนด (เช่น Status ใหม่ในอนาคตที่ยังไม่มี Tab)", () => {
    const result = buildStatusTabCounts(
      [
        { status: "CONFIRMED", count: 5 },
        { status: "SOME_NEW_STATUS", count: 2 },
      ],
      ["CONFIRMED", "CANCELLED"]
    );
    expect(result).toEqual({ CONFIRMED: 5, CANCELLED: 0 });
  });
});
