import { describe, it, expect } from "vitest";

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
