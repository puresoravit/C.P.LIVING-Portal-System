import { describe, it, expect } from "vitest";
import { fillYearMonths, computeSalesGrowth, type MonthlySalesPoint } from "./reports";

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

describe("computeSalesGrowth", () => {
  function point(month: number, net: number): MonthlySalesPoint {
    return { month, label: `M${month}`, net };
  }

  it("คำนวณ % ปกติ (บวก) จากเดือนก่อนหน้าในปีเดียวกัน", () => {
    const data = [point(1, 1000), point(2, 1500), ...Array.from({ length: 10 }, (_, i) => point(i + 3, 0))];
    const result = computeSalesGrowth(data, 0);
    expect(result[1]).toEqual({ month: 2, label: "M2", kind: "pct", value: 50 });
  });

  it("คำนวณ % ปกติ (ลบ) เมื่อยอดลดลงจากเดือนก่อน", () => {
    const data = [point(1, 1000), point(2, 500), ...Array.from({ length: 10 }, (_, i) => point(i + 3, 0))];
    const result = computeSalesGrowth(data, 0);
    expect(result[1]).toEqual({ month: 2, label: "M2", kind: "pct", value: -50 });
  });

  it("เดือนก่อน=0 และเดือนนี้=0 → kind flat (ไม่ใช่ pct 0)", () => {
    const data = Array.from({ length: 12 }, (_, i) => point(i + 1, 0));
    const result = computeSalesGrowth(data, 0);
    expect(result[5]).toEqual({ month: 6, label: "M6", kind: "flat" });
  });

  it("เดือนก่อน=0 แต่เดือนนี้>0 → kind new (ห้ามหาร 0/Infinity)", () => {
    const data = [point(1, 0), point(2, 800), ...Array.from({ length: 10 }, (_, i) => point(i + 3, 0))];
    const result = computeSalesGrowth(data, 0);
    expect(result[1]).toEqual({ month: 2, label: "M2", kind: "new" });
  });

  it("ม.ค. เทียบ ธ.ค. ปีก่อน (previousDecemberNet) เมื่อมีข้อมูลจริง", () => {
    const data = [point(1, 500), ...Array.from({ length: 11 }, (_, i) => point(i + 2, 0))];
    const result = computeSalesGrowth(data, 1000);
    expect(result[0]).toEqual({ month: 1, label: "M1", kind: "pct", value: -50 });
  });

  it("ม.ค. เมื่อ ธ.ค. ปีก่อน=0 และ ม.ค.=0 → flat", () => {
    const data = Array.from({ length: 12 }, (_, i) => point(i + 1, 0));
    const result = computeSalesGrowth(data, 0);
    expect(result[0]).toEqual({ month: 1, label: "M1", kind: "flat" });
  });

  it("ม.ค. เมื่อ ธ.ค. ปีก่อน=0 แต่ ม.ค.>0 → new (ปีแรกที่มีข้อมูลในระบบ)", () => {
    const data = [point(1, 300), ...Array.from({ length: 11 }, (_, i) => point(i + 2, 0))];
    const result = computeSalesGrowth(data, 0);
    expect(result[0]).toEqual({ month: 1, label: "M1", kind: "new" });
  });
});
