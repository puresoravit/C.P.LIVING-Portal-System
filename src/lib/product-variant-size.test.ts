import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeStandardVariantPrice, mergeSizeOptions, STANDARD_MATTRESS_SIZES, CUSTOM_SIZE_LABEL } from "./product-variant-size";

describe("computeStandardVariantPrice — David pricePerFoot=1000 (R6 Phase B UAT ที่กำหนด)", () => {
  it("3/3.5/4/5/6 ฟุต คำนวณตรง pricePerFoot × size ทุกไซส์", () => {
    const pricePerFoot = new Decimal(1000);
    expect(computeStandardVariantPrice(pricePerFoot, 3).toNumber()).toBe(3000);
    expect(computeStandardVariantPrice(pricePerFoot, 3.5).toNumber()).toBe(3500);
    expect(computeStandardVariantPrice(pricePerFoot, 4).toNumber()).toBe(4000);
    expect(computeStandardVariantPrice(pricePerFoot, 5).toNumber()).toBe(5000);
    expect(computeStandardVariantPrice(pricePerFoot, 6).toNumber()).toBe(6000);
  });

  it("ปัดเศษทศนิยม 2 ตำแหน่งตาม roundMoney เดิม (333.333 × 3 = 999.999 -> 1000.00)", () => {
    const price = computeStandardVariantPrice(new Decimal(333.333), 3);
    expect(price.toNumber()).toBe(1000);
    expect(price.decimalPlaces()).toBeLessThanOrEqual(2);
  });
});

describe("STANDARD_MATTRESS_SIZES — ตารางค่าคงที่ตรงตาม Requirement", () => {
  it("มีครบ 3/3.5/4/5/6 ฟุต เรียงตามลำดับ", () => {
    expect(STANDARD_MATTRESS_SIZES.map((s) => s.label)).toEqual(["3 ฟุต", "3.5 ฟุต", "4 ฟุต", "5 ฟุต", "6 ฟุต"]);
    expect(STANDARD_MATTRESS_SIZES.map((s) => s.value)).toEqual([3, 3.5, 4, 5, 6]);
  });
});

describe("mergeSizeOptions — Size ที่คีย์เอกสารได้ (Pure Function ไม่แตะ DB)", () => {
  it("usesSize=false — คืนเฉพาะ Variant จริงที่มีอยู่แล้ว ไม่มี Standard List/ขนาดพิเศษ (Regression: Model ที่ยังไม่จัด Category)", () => {
    const options = mergeSizeOptions(false, [{ productId: "p1", sku: "SKU-1", unit: "ใบ", size: null }]);
    expect(options).toEqual([
      { productId: "p1", sku: "SKU-1", unit: "ใบ", size: "", label: "ไม่มีขนาด", resolved: true, custom: false },
    ]);
  });

  it("usesSize=true, ไม่มี Variant เลย — Standard 5 ไซส์ resolved:false ทั้งหมด + ขนาดพิเศษท้ายสุด", () => {
    const options = mergeSizeOptions(true, []);
    expect(options).toHaveLength(6);
    expect(options.slice(0, 5).every((o) => !o.resolved && !o.custom)).toBe(true);
    expect(options[5]).toMatchObject({ label: CUSTOM_SIZE_LABEL, custom: true, resolved: false, productId: null });
  });

  it("usesSize=true, มี Variant ครบ 3/3.5/5/5/6 ฟุต (ขาด 4 ฟุต — เคส GT-David จริงจาก UAT) — 4 ฟุต resolved:false ที่เหลือ resolved:true", () => {
    const existing = [
      { productId: "p3", sku: "SKU-3", unit: "หลัง", size: "3 ฟุต" },
      { productId: "p35", sku: "SKU-3.5", unit: "หลัง", size: "3.5 ฟุต" },
      { productId: "p5a", sku: "SKU-5A", unit: "หลัง", size: "5 ฟุต" },
      { productId: "p5b", sku: "SKU-5B", unit: "หลัง", size: "5 ฟุต" },
      { productId: "p6", sku: "SKU-6", unit: "หลัง", size: "6 ฟุต" },
    ];
    const options = mergeSizeOptions(true, existing);
    const byLabel = Object.fromEntries(options.map((o) => [o.label, o]));
    expect(byLabel["3 ฟุต"].resolved).toBe(true);
    expect(byLabel["3.5 ฟุต"].resolved).toBe(true);
    expect(byLabel["4 ฟุต"].resolved).toBe(false);
    expect(byLabel["4 ฟุต"].productId).toBeNull();
    expect(byLabel["5 ฟุต"].resolved).toBe(true);
    expect(["p5a", "p5b"]).toContain(byLabel["5 ฟุต"].productId); // Duplicate เดิมในข้อมูลจริง (2 Product ไซส์เดียวกัน) ไม่ทำให้พัง — resolved ได้ตัวใดตัวหนึ่งเสมอ
    expect(byLabel["6 ฟุต"].resolved).toBe(true);
    expect(options.find((o) => o.custom)?.label).toBe(CUSTOM_SIZE_LABEL);
  });

  it("usesSize=true, มี Variant ที่ไม่ตรง Standard List (เช่น ไม่มีขนาด/ขนาดพิเศษเดิมจาก Batch Size Tool) — ยังเลือกได้เหมือนเดิม ไม่หายไป", () => {
    const options = mergeSizeOptions(true, [{ productId: "pOld", sku: "SKU-OLD", unit: "หลัง", size: "4.2 เมตร (เก่า)" }]);
    const legacy = options.find((o) => o.label === "4.2 เมตร (เก่า)");
    expect(legacy).toMatchObject({ productId: "pOld", resolved: true, custom: false });
    // ยังมี Standard 5 ไซส์ + ขนาดพิเศษ ครบตามเดิม รวมเป็น 7
    expect(options).toHaveLength(7);
  });
});
