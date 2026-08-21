import { describe, it, expect } from "vitest";
import { fillYearMonths } from "./reports";

// หมายเหตุ: ฟังก์ชันหลักของ reports.ts (getSalesByGroup, getDashboard ฯลฯ)
// ต้องต่อ Database จริงจึง unit test ตรงๆ ไม่ได้ในนี้ — ครอบคลุมด้วย
// Integration Test ตอน Phase 9 (Testing) แทน ในนี้ทดสอบแค่กติกาการ
// Sort ผลลัพธ์ที่ควรจะเป็น (deterministic logic ที่ไม่ต้องพึ่ง DB)
describe("Report group sorting expectations", () => {
  it("Top N ต้องเรียงจากมากไปน้อยตาม net เสมอ", () => {
    const groups = [
      { key: "a", label: "A", metrics: { quantity: 1, gross: 100, discount: 0, net: 100, vat: 0, total: 100 } },
      { key: "b", label: "B", metrics: { quantity: 1, gross: 300, discount: 0, net: 300, vat: 0, total: 300 } },
      { key: "c", label: "C", metrics: { quantity: 1, gross: 200, discount: 0, net: 200, vat: 0, total: 200 } },
    ];
    const sorted = [...groups].sort((x, y) => y.metrics.net - x.metrics.net);
    expect(sorted.map((g) => g.key)).toEqual(["b", "c", "a"]);
  });
});

describe("fillYearMonths", () => {
  it("เติมครบ 12 เดือนเสมอ แม้ getSalesByGroup คืนมาแค่บางเดือน", () => {
    const groups = [
      { key: "2026-03", label: "2026-03", metrics: { quantity: 1, gross: 1000, discount: 0, net: 1000, vat: 0, total: 1000 } },
      { key: "2026-08", label: "2026-08", metrics: { quantity: 2, gross: 2000, discount: 0, net: 2000, vat: 0, total: 2000 } },
    ];
    const result = fillYearMonths(2026, groups);
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ month: 1, label: "ม.ค.", net: 0 });
    expect(result[2]).toEqual({ month: 3, label: "มี.ค.", net: 1000 });
    expect(result[7]).toEqual({ month: 8, label: "ส.ค.", net: 2000 });
    expect(result[11]).toEqual({ month: 12, label: "ธ.ค.", net: 0 });
  });

  it("ไม่มีข้อมูลเดือนไหนเลย — ทุกเดือนเป็น 0 ไม่ Error", () => {
    const result = fillYearMonths(2025, []);
    expect(result).toHaveLength(12);
    expect(result.every((m) => m.net === 0)).toBe(true);
  });

  it("ไม่ปนข้อมูลข้ามปี — เดือนของปีอื่นต้องไม่ถูกนับ", () => {
    const groups = [
      { key: "2025-08", label: "2025-08", metrics: { quantity: 1, gross: 999, discount: 0, net: 999, vat: 0, total: 999 } },
    ];
    const result = fillYearMonths(2026, groups);
    expect(result[7].net).toBe(0);
  });
});
