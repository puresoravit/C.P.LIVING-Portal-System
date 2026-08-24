import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

// Fresh UAT Fix — พิสูจน์ Discount Group Resolution Chain ของ Manual Tax Invoice ทั้งเส้น
// ผ่าน mocked DB (Pattern เดียวกับ apply-discount.test.ts): productId → productTypeId →
// getEffectiveDiscountPct (Priority สาขา → ลูกค้า → 0%) → amount ปัด Half Up — Owner
// Reproduce เจอ Discount=0 ใน Fresh UAT: Root Cause คือ DB ไม่มี DiscountRule (โดน Fresh
// Reset ลบ) ไม่ใช่ Resolution หลุด — เทสชุดนี้ตรึงพฤติกรรมว่า "ถ้า Rule valid มีจริง ต้อง
// Apply % ถูกต้องจริง" ทั้ง Standard Product และ Size Variant โดยไม่ Hardcode ชื่อ/%
vi.mock("@/lib/db", () => ({
  db: {
    product: { findUnique: vi.fn() },
    discountRule: { findFirst: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { resolveGroupDiscounts } from "./tax-invoice-group-discount";

const mockDb = db as unknown as {
  product: { findUnique: ReturnType<typeof vi.fn> };
  discountRule: { findFirst: ReturnType<typeof vi.fn> };
};

const baseParams = { customerId: "cust1", branchId: null, orderDate: new Date("2026-08-24") };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveGroupDiscounts — Discount Group → Manual Tax Invoice", () => {
  it("Standard Product ที่อยู่กลุ่มส่วนลด + มี Customer Rule → apply % ของ Rule จริง (ไม่ hardcode)", async () => {
    mockDb.product.findUnique.mockResolvedValue({ productTypeId: "typeA" });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(5) });

    const r = await resolveGroupDiscounts({ ...baseParams, items: [{ productId: "prod1", amount: 2000 }] });

    expect(r.discountPcts).toEqual([5]);
    expect(r.discountAmounts).toEqual([100]); // 2000 × 5% = 100
    // Query DiscountRule ด้วยกลุ่มของสินค้าตัวนั้นจริง
    expect(mockDb.discountRule.findFirst.mock.calls[0][0].where.productTypeId).toBe("typeA");
    expect(mockDb.discountRule.findFirst.mock.calls[0][0].where.customerId).toBe("cust1");
  });

  it("Size Variant (Product แถวจริงของ Family ที่มี productTypeId ของตัวเอง) → resolve ผ่านเส้นเดียวกับ Standard เป๊ะ", async () => {
    // Variant ถูกสร้างพร้อม productTypeId เสมอ (syncStandardVariants copy จาก Anchor)
    mockDb.product.findUnique.mockResolvedValue({ productTypeId: "typeA" });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(5) });

    const r = await resolveGroupDiscounts({
      ...baseParams,
      items: [
        { productId: "variant-3ft", amount: 1200 },
        { productId: "variant-5ft", amount: 2000 },
      ],
    });

    expect(r.discountPcts).toEqual([5, 5]);
    expect(r.discountAmounts).toEqual([60, 100]); // ต่อบรรทัด: 1200×5%=60, 2000×5%=100
  });

  it("Branch Rule ชนะ Customer Rule ตาม Priority เดิมของ getEffectiveDiscountPct", async () => {
    mockDb.product.findUnique.mockResolvedValue({ productTypeId: "typeA" });
    // เรียกครั้งแรก = tier สาขา (branchId ระบุ) → เจอ 8%
    mockDb.discountRule.findFirst.mockResolvedValueOnce({ discountPct: new Decimal(8) });

    const r = await resolveGroupDiscounts({
      ...baseParams,
      branchId: "branch1",
      items: [{ productId: "prod1", amount: 1000 }],
    });

    expect(r.discountPcts).toEqual([8]);
    expect(r.discountAmounts).toEqual([80]);
    expect(mockDb.discountRule.findFirst.mock.calls[0][0].where.branchId).toBe("branch1");
  });

  it("ไม่มี Rule ใน DB → 0 ตามเดิม (นี่คือสถานการณ์จริงที่ Owner Reproduce หลัง Fresh Reset)", async () => {
    mockDb.product.findUnique.mockResolvedValue({ productTypeId: "typeA" });
    mockDb.discountRule.findFirst.mockResolvedValue(null); // ทั้ง 2 tier ไม่เจอ

    const r = await resolveGroupDiscounts({ ...baseParams, items: [{ productId: "prod1", amount: 2000 }] });

    expect(r.discountPcts).toEqual([0]);
    expect(r.discountAmounts).toEqual([0]);
  });

  it("รายการพิมพ์เอง (productId=null) → 0 โดยไม่ Query อะไรเลย", async () => {
    const r = await resolveGroupDiscounts({ ...baseParams, items: [{ productId: null, amount: 999 }] });

    expect(r.discountPcts).toEqual([0]);
    expect(r.discountAmounts).toEqual([0]);
    expect(mockDb.product.findUnique).not.toHaveBeenCalled();
    expect(mockDb.discountRule.findFirst).not.toHaveBeenCalled();
  });

  it("Product ไม่ระบุกลุ่มส่วนลด (productTypeId=null) → 0 โดยไม่ Query DiscountRule (semantic เดียวกับ Order/Quotation)", async () => {
    mockDb.product.findUnique.mockResolvedValue({ productTypeId: null });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(10) }); // มี Rule แต่ต้องไม่ถูกใช้

    const r = await resolveGroupDiscounts({ ...baseParams, items: [{ productId: "prod-no-type", amount: 500 }] });

    expect(r.discountPcts).toEqual([0]);
    expect(mockDb.discountRule.findFirst).not.toHaveBeenCalled();
  });

  it("ปัดส่วนลดต่อบรรทัด 2 ตำแหน่งแบบ Round Half Up (สูตรเดียวกับ computeQuotationCalc)", async () => {
    mockDb.product.findUnique.mockResolvedValue({ productTypeId: "typeA" });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(5) });

    // 333.30 × 5% = 16.665 → 16.67 (Half Up)
    const r = await resolveGroupDiscounts({ ...baseParams, items: [{ productId: "prod1", amount: 333.3 }] });

    expect(r.discountAmounts).toEqual([16.67]);
  });

  it("หลายบรรทัดคละกัน (มี Rule / ไม่ทราบกลุ่ม / พิมพ์เอง) → ตำแหน่ง Index ตรงกับ items เสมอ", async () => {
    mockDb.product.findUnique
      .mockResolvedValueOnce({ productTypeId: "typeA" })
      .mockResolvedValueOnce({ productTypeId: null });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(5) });

    const r = await resolveGroupDiscounts({
      ...baseParams,
      items: [
        { productId: "prod1", amount: 1000 },
        { productId: "prod-no-type", amount: 1000 },
        { productId: null, amount: 1000 },
      ],
    });

    expect(r.discountPcts).toEqual([5, 0, 0]);
    expect(r.discountAmounts).toEqual([50, 0, 0]);
  });
});
