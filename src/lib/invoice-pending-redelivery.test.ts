import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeRedeliveryLines } from "./invoice-pending-redelivery";

describe("computeRedeliveryLines — หมวดค้างส่ง (Owner UAT 2026-08-29)", () => {
  it("ลดจำนวนสินค้าเดิม (5→3) → เหลือส่วนต่าง 2", () => {
    const oldItems = [
      { productId: "p1", productNameSnapshot: "ที่นอนสปริง Mary", sizeSnapshot: "3.5 ฟุต", unitSnapshot: "หลัง", quantity: new Decimal(5) },
    ];
    const newItems = [
      { productId: "p1", productNameSnapshot: "ที่นอนสปริง Mary", sizeSnapshot: "3.5 ฟุต", unitSnapshot: "หลัง", quantity: new Decimal(3) },
    ];
    const lines = computeRedeliveryLines(oldItems, newItems);
    expect(lines).toEqual([{ productNameSnapshot: "ที่นอนสปริง Mary", sizeSnapshot: "3.5 ฟุต", unitSnapshot: "หลัง", quantity: 2 }]);
  });

  it("ลบรายการออกทั้งหมด (คีย์หายไปจากใบใหม่) → ค้างส่งเต็มจำนวนเดิม", () => {
    const oldItems = [
      { productId: "p1", productNameSnapshot: "หมอน A", sizeSnapshot: null, unitSnapshot: "ใบ", quantity: new Decimal(10) },
    ];
    const lines = computeRedeliveryLines(oldItems, []);
    expect(lines).toEqual([{ productNameSnapshot: "หมอน A", sizeSnapshot: null, unitSnapshot: "ใบ", quantity: 10 }]);
  });

  it("เพิ่มจำนวน (ไม่ใช่ลด) → ไม่มีรายการค้างส่ง", () => {
    const oldItems = [{ productId: "p1", productNameSnapshot: "หมอน A", sizeSnapshot: null, unitSnapshot: "ใบ", quantity: new Decimal(2) }];
    const newItems = [{ productId: "p1", productNameSnapshot: "หมอน A", sizeSnapshot: null, unitSnapshot: "ใบ", quantity: new Decimal(5) }];
    expect(computeRedeliveryLines(oldItems, newItems)).toEqual([]);
  });

  it("สินค้าเดียวกัน ไซส์ต่างกัน = คนละคีย์ ไม่ปนกัน", () => {
    const oldItems = [
      { productId: "p1", productNameSnapshot: "ที่นอนสปริง Mary", sizeSnapshot: "3.5 ฟุต", unitSnapshot: "หลัง", quantity: new Decimal(3) },
      { productId: "p1", productNameSnapshot: "ที่นอนสปริง Mary", sizeSnapshot: "5 ฟุต", unitSnapshot: "หลัง", quantity: new Decimal(2) },
    ];
    const newItems = [
      { productId: "p1", productNameSnapshot: "ที่นอนสปริง Mary", sizeSnapshot: "3.5 ฟุต", unitSnapshot: "หลัง", quantity: new Decimal(3) },
      { productId: "p1", productNameSnapshot: "ที่นอนสปริง Mary", sizeSnapshot: "5 ฟุต", unitSnapshot: "หลัง", quantity: new Decimal(0) },
    ];
    // ไซส์ 5 ฟุต หายไปเต็ม แต่ 3.5 ฟุต เท่าเดิมไม่ควรติดมาด้วย
    expect(computeRedeliveryLines(oldItems, newItems)).toEqual([
      { productNameSnapshot: "ที่นอนสปริง Mary", sizeSnapshot: "5 ฟุต", unitSnapshot: "หลัง", quantity: 2 },
    ]);
  });

  it("หลายบรรทัดสินค้าเดียวกันในใบเดิม รวมกันก่อนเทียบ", () => {
    const oldItems = [
      { productId: "p1", productNameSnapshot: "หมอน A", sizeSnapshot: null, unitSnapshot: "ใบ", quantity: new Decimal(3) },
      { productId: "p1", productNameSnapshot: "หมอน A", sizeSnapshot: null, unitSnapshot: "ใบ", quantity: new Decimal(2) },
    ];
    const newItems = [{ productId: "p1", productNameSnapshot: "หมอน A", sizeSnapshot: null, unitSnapshot: "ใบ", quantity: new Decimal(4) }];
    // รวมเดิม 5 → ใหม่ 4 → ลด 1
    expect(computeRedeliveryLines(oldItems, newItems)).toEqual([
      { productNameSnapshot: "หมอน A", sizeSnapshot: null, unitSnapshot: "ใบ", quantity: 1 },
    ]);
  });

  it("ยอดเท่าเดิมเป๊ะ (ไม่แก้อะไรจริง) → ไม่มีรายการค้างส่ง", () => {
    const items = [{ productId: "p1", productNameSnapshot: "หมอน A", sizeSnapshot: null, unitSnapshot: "ใบ", quantity: new Decimal(3) }];
    expect(computeRedeliveryLines(items, items)).toEqual([]);
  });
});
