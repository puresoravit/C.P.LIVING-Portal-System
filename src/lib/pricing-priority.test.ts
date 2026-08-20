import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

// Mock @/lib/db ก่อน import pricing.ts (vi.mock ถูก hoist ขึ้นบนสุดของไฟล์
// โดย vitest อัตโนมัติ — ต้องเขียนแบบ inline factory ไม่อ้างตัวแปรนอก scope)
vi.mock("@/lib/db", () => ({
  db: {
    priceRule: { findFirst: vi.fn() },
    discountRule: { findFirst: vi.fn() },
    product: { findUniqueOrThrow: vi.fn() },
    vatRate: { findFirst: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { getEffectivePrice, getEffectiveDiscountPct, getEffectiveVatRate } from "./pricing";

const mockDb = db as unknown as {
  priceRule: { findFirst: ReturnType<typeof vi.fn> };
  discountRule: { findFirst: ReturnType<typeof vi.fn> };
  product: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
  vatRate: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getEffectivePrice — Price Priority (ข้อ 12, 18) ผ่าน mocked DB", () => {
  const params = { productId: "p1", customerId: "c1", branchId: "b1", orderDate: new Date("2026-01-01") };

  it("มี Branch Price -> ใช้ Branch Price ทันที ไม่ query Customer/Standard ต่อ", async () => {
    mockDb.priceRule.findFirst.mockResolvedValueOnce({ price: new Decimal(100) });

    const result = await getEffectivePrice(params);

    expect(result.source).toBe("BRANCH");
    expect(result.price.toString()).toBe("100");
    expect(mockDb.priceRule.findFirst).toHaveBeenCalledTimes(1);
  });

  it("ไม่มี Branch Price -> fallback ไป Customer Price", async () => {
    mockDb.priceRule.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ price: new Decimal(200) });

    const result = await getEffectivePrice(params);

    expect(result.source).toBe("CUSTOMER");
    expect(result.price.toString()).toBe("200");
    expect(mockDb.priceRule.findFirst).toHaveBeenCalledTimes(2);
  });

  it("ไม่มีทั้ง Branch และ Customer Price -> fallback ไป Standard Price ของ Product", async () => {
    mockDb.priceRule.findFirst.mockResolvedValue(null);
    mockDb.product.findUniqueOrThrow.mockResolvedValueOnce({ standardPrice: new Decimal(50) });

    const result = await getEffectivePrice(params);

    expect(result.source).toBe("STANDARD");
    expect(result.price.toString()).toBe("50");
  });
});

describe("getEffectiveDiscountPct — Discount Priority (ข้อ 15, 20) ผ่าน mocked DB", () => {
  const params = { customerId: "c1", branchId: "b1", productTypeId: "t1", orderDate: new Date("2026-01-01") };

  it("มี Branch+Type Discount -> ใช้ทันที ไม่ query Customer ต่อ", async () => {
    mockDb.discountRule.findFirst.mockResolvedValueOnce({ discountPct: new Decimal(12) });

    const result = await getEffectiveDiscountPct(params);

    expect(result.source).toBe("BRANCH");
    expect(result.discountPct.toString()).toBe("12");
    expect(mockDb.discountRule.findFirst).toHaveBeenCalledTimes(1);
  });

  it("ไม่มี Branch Discount -> fallback ไป Customer+Type Discount", async () => {
    mockDb.discountRule.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ discountPct: new Decimal(10) });

    const result = await getEffectiveDiscountPct(params);

    expect(result.source).toBe("CUSTOMER");
    expect(result.discountPct.toString()).toBe("10");
  });

  it("ไม่มี Discount Rule เลย -> Default 0% (ข้อ 15)", async () => {
    mockDb.discountRule.findFirst.mockResolvedValue(null);

    const result = await getEffectiveDiscountPct(params);

    expect(result.source).toBe("DEFAULT");
    expect(result.discountPct.toString()).toBe("0");
  });
});

describe("getEffectiveVatRate — VAT Effective Date (ข้อ 26) ผ่าน mocked DB", () => {
  it("ใช้อัตราที่ query เจอตามวันที่", async () => {
    mockDb.vatRate.findFirst.mockResolvedValueOnce({ ratePct: new Decimal(7) });

    const rate = await getEffectiveVatRate(new Date("2026-08-01"));

    expect(rate.toString()).toBe("7");
  });

  it("ไม่พบ config ใน DB เลย -> fallback 7% (safety net ไม่ควรเกิดขึ้นถ้า seed ถูกต้อง)", async () => {
    mockDb.vatRate.findFirst.mockResolvedValueOnce(null);

    const rate = await getEffectiveVatRate(new Date("2026-08-01"));

    expect(rate.toString()).toBe("7");
  });
});
