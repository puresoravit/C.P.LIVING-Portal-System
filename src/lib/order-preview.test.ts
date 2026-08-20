import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { groupByTypeAndApplyDiscount, type PreviewLineItem } from "./order-preview";

function line(over: Partial<PreviewLineItem>): PreviewLineItem {
  return {
    orderItemId: "x",
    productId: "p",
    sku: "SKU",
    productName: "name",
    productTypeId: "A",
    productTypeCode: "A",
    productTypeName: "TYPE A",
    size: null,
    quantity: new Decimal(1),
    unit: "หลัง",
    unitPrice: new Decimal(0),
    grossAmount: new Decimal(0),
    ...over,
  };
}

describe("groupByTypeAndApplyDiscount — Golden Test Case (ข้อ 66)", () => {
  it("Order ผสม M001×10(A) B001×5(B) M002×3(A) P001×20(C) แยกเป็น 3 กลุ่ม คำนวณถูกต้องทุก field", () => {
    const lines: PreviewLineItem[] = [
      line({
        orderItemId: "1",
        sku: "M001",
        productTypeId: "A",
        productTypeCode: "A",
        productTypeName: "TYPE A",
        quantity: new Decimal(10),
        unitPrice: new Decimal(1000),
        grossAmount: new Decimal(10000),
      }),
      line({
        orderItemId: "2",
        sku: "M002",
        productTypeId: "A",
        productTypeCode: "A",
        productTypeName: "TYPE A",
        quantity: new Decimal(3),
        unitPrice: new Decimal(1000),
        grossAmount: new Decimal(3000),
      }),
      line({
        orderItemId: "3",
        sku: "B001",
        productTypeId: "B",
        productTypeCode: "B",
        productTypeName: "TYPE B",
        quantity: new Decimal(5),
        unitPrice: new Decimal(2000),
        grossAmount: new Decimal(10000),
      }),
      line({
        orderItemId: "4",
        sku: "P001",
        productTypeId: "C",
        productTypeCode: "C",
        productTypeName: "TYPE C",
        quantity: new Decimal(20),
        unitPrice: new Decimal(500),
        grossAmount: new Decimal(10000),
      }),
    ];

    // ตัวอย่าง Discount Rule: Type A=10%, Type B=15%, Type C=20% (ตามข้อ 66)
    const discountByTypeId = { A: new Decimal(10), B: new Decimal(15), C: new Decimal(20) };

    const groups = groupByTypeAndApplyDiscount(lines, discountByTypeId);

    // ต้องได้ 3 กลุ่ม = จะแตกเป็น Invoice A, B, C ต่อไปใน Phase 4 (ข้อ 22)
    expect(groups).toHaveLength(3);

    const typeA = groups.find((g) => g.productTypeCode === "A")!;
    expect(typeA.items.map((i) => i.sku)).toEqual(["M001", "M002"]); // M001+M002 รวมกันเป็นกลุ่มเดียว
    expect(typeA.grossAmount.toString()).toBe("13000");
    expect(typeA.discountAmount.toString()).toBe("1300");
    expect(typeA.netAmount.toString()).toBe("11700");

    const typeB = groups.find((g) => g.productTypeCode === "B")!;
    expect(typeB.items.map((i) => i.sku)).toEqual(["B001"]);
    expect(typeB.grossAmount.toString()).toBe("10000");
    expect(typeB.discountAmount.toString()).toBe("1500");
    expect(typeB.netAmount.toString()).toBe("8500");

    const typeC = groups.find((g) => g.productTypeCode === "C")!;
    expect(typeC.items.map((i) => i.sku)).toEqual(["P001"]);
    expect(typeC.grossAmount.toString()).toBe("10000");
    expect(typeC.discountAmount.toString()).toBe("2000");
    expect(typeC.netAmount.toString()).toBe("8000");
  });

  it("ไม่มีทางสร้างกลุ่มว่างเปล่า (สอดคล้องข้อ 22 ห้ามสร้าง Empty Invoice)", () => {
    const lines: PreviewLineItem[] = [line({ orderItemId: "1", productTypeId: "A", productTypeCode: "A" })];
    const groups = groupByTypeAndApplyDiscount(lines, {});
    expect(groups).toHaveLength(1);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it("ไม่มี Discount Rule เลย -> ใช้ 0% เป็นค่า default (ข้อ 15)", () => {
    const lines: PreviewLineItem[] = [
      line({ orderItemId: "1", productTypeId: "A", productTypeCode: "A", grossAmount: new Decimal(1000) }),
    ];
    const groups = groupByTypeAndApplyDiscount(lines, {});
    expect(groups[0].discountPct.toString()).toBe("0");
    expect(groups[0].discountAmount.toString()).toBe("0");
    expect(groups[0].netAmount.toString()).toBe("1000");
  });

  // Phase C: Size Snapshot — size ต้องผ่าน grouping ไปเฉยๆ ไม่กระทบการคำนวณใดๆ
  it("size ของแต่ละ line ผ่านเข้า-ออก grouping โดยไม่ถูกแตะ (ไม่มีผลต่อ discount/net)", () => {
    const lines: PreviewLineItem[] = [
      line({ orderItemId: "1", productTypeId: "A", productTypeCode: "A", size: "5 ฟุต", grossAmount: new Decimal(1000) }),
      line({ orderItemId: "2", productTypeId: "A", productTypeCode: "A", size: null, grossAmount: new Decimal(500) }),
    ];
    const groups = groupByTypeAndApplyDiscount(lines, {});
    expect(groups[0].items.map((i) => i.size)).toEqual(["5 ฟุต", null]);
    expect(groups[0].grossAmount.toString()).toBe("1500");
  });
});
