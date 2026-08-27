import { describe, it, expect } from "vitest";
import { reconcileInvoiceGroups } from "./invoice-reconcile";

// R11 ข้อ 5 — Invariant: การแก้ Order ต้องคงเลข INV เดิมของกลุ่มที่ยังอยู่ ยกเลิกเฉพาะ
// กลุ่มที่หายหมด และออกเลขใหม่เฉพาะกลุ่มใหม่จริงๆ เท่านั้น

describe("reconcileInvoiceGroups", () => {
  it("กลุ่มเดิมทุกกลุ่มยังอยู่ = update ทั้งหมด ไม่ยกเลิก ไม่ออกใหม่", () => {
    const plan = reconcileInvoiceGroups(
      [
        { id: "a", productTypeCode: "MT" },
        { id: "b", productTypeCode: "PL" },
      ],
      ["MT", "PL"]
    );
    expect(plan.updates).toEqual([
      { productTypeCode: "MT", invoiceId: "a" },
      { productTypeCode: "PL", invoiceId: "b" },
    ]);
    expect(plan.cancels).toEqual([]);
    expect(plan.creates).toEqual([]);
  });

  it("กลุ่มที่รายการหายหมด = ยกเลิกใบนั้น (Owner: 'ไม่มีเลข INV ก็ต้องลบไป')", () => {
    const plan = reconcileInvoiceGroups(
      [
        { id: "a", productTypeCode: "MT" },
        { id: "b", productTypeCode: "PL" },
      ],
      ["MT"]
    );
    expect(plan.updates).toEqual([{ productTypeCode: "MT", invoiceId: "a" }]);
    expect(plan.cancels).toEqual(["b"]);
    expect(plan.creates).toEqual([]);
  });

  it("กลุ่มใหม่ที่เพิ่งโผล่ = ออกใบใหม่เฉพาะกลุ่มนั้น กลุ่มเดิมคงเลขเดิม", () => {
    const plan = reconcileInvoiceGroups([{ id: "a", productTypeCode: "MT" }], ["MT", "AC"]);
    expect(plan.updates).toEqual([{ productTypeCode: "MT", invoiceId: "a" }]);
    expect(plan.cancels).toEqual([]);
    expect(plan.creates).toEqual(["AC"]);
  });

  it("ครบทั้งสามแบบพร้อมกัน: คงเดิม + หายไป + เพิ่มใหม่", () => {
    const plan = reconcileInvoiceGroups(
      [
        { id: "a", productTypeCode: "MT" },
        { id: "b", productTypeCode: "PL" },
      ],
      ["MT", "AC"]
    );
    expect(plan.updates).toEqual([{ productTypeCode: "MT", invoiceId: "a" }]);
    expect(plan.cancels).toEqual(["b"]);
    expect(plan.creates).toEqual(["AC"]);
  });

  it("ไม่มีใบเดิมเลย (Edge) = สร้างใหม่ทุกกลุ่ม", () => {
    const plan = reconcileInvoiceGroups([], ["MT", "PL"]);
    expect(plan.updates).toEqual([]);
    expect(plan.cancels).toEqual([]);
    expect(plan.creates).toEqual(["MT", "PL"]);
  });

  it("ใบซ้ำกลุ่มเดียวกัน (สถานะผิดปกติ) = เก็บใบแรก ยกเลิกที่เหลือ", () => {
    const plan = reconcileInvoiceGroups(
      [
        { id: "a1", productTypeCode: "MT" },
        { id: "a2", productTypeCode: "MT" },
      ],
      ["MT"]
    );
    expect(plan.updates).toEqual([{ productTypeCode: "MT", invoiceId: "a1" }]);
    expect(plan.cancels).toEqual(["a2"]);
    expect(plan.creates).toEqual([]);
  });

  it("ทุกใบต้องอยู่ในแผนพอดี 1 ที่ (ไม่หาย ไม่ซ้ำ) — ทุกกลุ่มใหม่ต้องมีปลายทาง", () => {
    const existing = [
      { id: "a", productTypeCode: "MT" },
      { id: "b", productTypeCode: "PL" },
      { id: "c", productTypeCode: "AC" },
    ];
    const newCodes = ["PL", "SP", "MT"];
    const plan = reconcileInvoiceGroups(existing, newCodes);
    const planned = [...plan.updates.map((u) => u.invoiceId), ...plan.cancels];
    expect(planned.sort()).toEqual(["a", "b", "c"]);
    expect([...plan.updates.map((u) => u.productTypeCode), ...plan.creates].sort()).toEqual([...newCodes].sort());
  });
});
