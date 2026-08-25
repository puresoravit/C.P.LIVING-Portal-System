import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

// Mock @/lib/db ก่อน import (Pattern เดียวกับ pricing-priority.test.ts)
vi.mock("@/lib/db", () => ({
  db: {
    discountRule: { findFirst: vi.fn() },
    productType: { findUnique: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { resolveBillingNoteDiscounts, discountLinesByInvoiceId } from "./billing-note-discount";

const mockDb = db as unknown as {
  discountRule: { findFirst: ReturnType<typeof vi.fn> };
  productType: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  // getEffectiveDiscountPct จะ query discountRule 2 ครั้ง (Branch/Customer) — Default ไม่มี Rule
  mockDb.discountRule.findFirst.mockResolvedValue(null);
  // productType.findUnique ถูกเรียก 2 แบบ: where.code (Map code→id ของ lib นี้เอง) และ
  // where.id (Tier GROUP ใน getEffectiveDiscountPct) — แยกพฤติกรรมตาม Argument จริง
  mockDb.productType.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.code === "A") return { id: "typeA-id", name: "กลุ่ม Box Mary" };
    if (args?.where?.code) return null; // Code ที่ไม่รู้จัก (เช่น GEN)
    if (args?.where?.id === "typeA-id") return { defaultDiscountPct: new Decimal(10) };
    return null;
  });
});

const baseParams = {
  customerId: "c1",
  billingNoteDate: new Date("2026-08-25"),
};

describe("resolveBillingNoteDiscounts — ส่วนลดระดับใบวางบิล (Smoke Test 2026-08-25)", () => {
  it("ใบราคาเต็ม + กลุ่มมี 10% → หัก 10% ของ grandTotal", async () => {
    const result = await resolveBillingNoteDiscounts({
      ...baseParams,
      invoices: [
        { id: "inv1", branchId: null, productTypeCode: "A", grandTotal: new Decimal(1000), discountAmount: new Decimal(0) },
      ],
    });

    expect(result.lines).toEqual([{ invoiceId: "inv1", pct: 10, amount: 100, alreadyDiscounted: false, typeName: "กลุ่ม Box Mary" }]);
    expect(result.discountTotal.toString()).toBe("100");
  });

  it("กติกาสำคัญ: ใบที่หักส่วนลดแล้วตอนออกใบ (discountAmount > 0) ห้ามหักซ้ำ", async () => {
    const result = await resolveBillingNoteDiscounts({
      ...baseParams,
      invoices: [
        { id: "inv1", branchId: null, productTypeCode: "A", grandTotal: new Decimal(900), discountAmount: new Decimal(100) },
        { id: "inv2", branchId: null, productTypeCode: "A", grandTotal: new Decimal(2000), discountAmount: new Decimal(0) },
      ],
    });

    expect(result.lines[0]).toEqual({ invoiceId: "inv1", pct: 0, amount: 0, alreadyDiscounted: true, typeName: "กลุ่ม Box Mary" });
    expect(result.lines[1]).toEqual({ invoiceId: "inv2", pct: 10, amount: 200, alreadyDiscounted: false, typeName: "กลุ่ม Box Mary" });
    expect(result.discountTotal.toString()).toBe("200");
  });

  it("ใบกลุ่ม GEN/Code ที่ไม่มีในระบบ → 0% (Semantic เดียวกับ Order/Quotation)", async () => {
    const result = await resolveBillingNoteDiscounts({
      ...baseParams,
      invoices: [
        { id: "inv1", branchId: null, productTypeCode: "GEN", grandTotal: new Decimal(500), discountAmount: new Decimal(0) },
      ],
    });

    expect(result.lines).toEqual([{ invoiceId: "inv1", pct: 0, amount: 0, alreadyDiscounted: false, typeName: null }]);
    expect(result.discountTotal.toString()).toBe("0");
  });

  it("Rule รายลูกค้า Override % กลุ่ม (ผ่าน getEffectiveDiscountPct เดิมทั้ง Chain)", async () => {
    // branchId=null → getEffectiveDiscountPct ข้าม Branch Query ไปเลย (ไม่เรียก findFirst)
    // เหลือ Customer Query ครั้งเดียว → queue Once แค่ 1 ตัว (เกินแล้วจะรั่วไป Test ถัดไป
    // เพราะ clearAllMocks ไม่ล้าง once-queue — บทเรียนเดียวกับ pricing-priority.test.ts)
    mockDb.discountRule.findFirst.mockResolvedValueOnce({ discountPct: new Decimal(15) });

    const result = await resolveBillingNoteDiscounts({
      ...baseParams,
      invoices: [
        { id: "inv1", branchId: null, productTypeCode: "A", grandTotal: new Decimal(1000), discountAmount: new Decimal(0) },
      ],
    });

    expect(result.lines[0].pct).toBe(15);
    expect(result.lines[0].amount).toBe(150);
  });

  it("ปัดเศษ roundMoney ต่อใบ (2,625 × 10% = 262.50) และรวมยอดถูกต้อง", async () => {
    const result = await resolveBillingNoteDiscounts({
      ...baseParams,
      invoices: [
        { id: "inv1", branchId: null, productTypeCode: "A", grandTotal: new Decimal(2625), discountAmount: new Decimal(0) },
        { id: "inv2", branchId: null, productTypeCode: "A", grandTotal: new Decimal(333.33), discountAmount: new Decimal(0) },
      ],
    });

    expect(result.lines[0].amount).toBe(262.5);
    expect(result.lines[1].amount).toBe(33.33); // 33.333 → ปัด 2 ตำแหน่ง
    expect(result.discountTotal.toString()).toBe("295.83");
  });
});

describe("discountLinesByInvoiceId — อ่าน Snapshot Json กลับอย่างปลอดภัย", () => {
  it("แถว Legacy (null/undefined/ไม่ใช่ Array) → Map ว่าง ไม่พัง", () => {
    expect(discountLinesByInvoiceId(null).size).toBe(0);
    expect(discountLinesByInvoiceId(undefined).size).toBe(0);
    expect(discountLinesByInvoiceId({ junk: true }).size).toBe(0);
  });

  it("Array ปกติ → Map ต่อ invoiceId พร้อม Coerce ชนิดข้อมูล", () => {
    const map = discountLinesByInvoiceId([
      { invoiceId: "inv1", pct: 10, amount: 100, alreadyDiscounted: false },
      { invoiceId: "inv2", pct: 0, amount: 0, alreadyDiscounted: true },
      { bad: "row" },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("inv1")).toEqual({ invoiceId: "inv1", pct: 10, amount: 100, alreadyDiscounted: false, typeName: null });
    expect(map.get("inv2")?.alreadyDiscounted).toBe(true);
  });
});
