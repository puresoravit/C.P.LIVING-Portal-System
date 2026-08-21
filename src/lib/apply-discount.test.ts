import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

// R3 — Mock @/lib/db ก่อน import order-preview.ts/quotation-pricing.ts (เหมือน
// pricing-priority.test.ts) เพื่อทดสอบ computeOrderPreview/computeQuotationCalc แบบ
// End-to-End จริง (ไม่ใช่แค่ Pure Function ส่วนที่แยกออกมาทดสอบได้อยู่แล้วใน
// order-preview.test.ts/quotation-pricing.test.ts) — ยืนยันว่า applyDiscount=false
// "ข้าม" การ Query DiscountRule ไปเลย ไม่ใช่แค่ Query แล้ว Override ทีหลัง
vi.mock("@/lib/db", () => ({
  db: {
    order: { findUniqueOrThrow: vi.fn() },
    product: { findUniqueOrThrow: vi.fn() },
    priceRule: { findFirst: vi.fn() },
    discountRule: { findFirst: vi.fn() },
    vatRate: { findFirst: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { computeOrderPreview } from "./order-preview";
import { computeQuotationCalc } from "./quotation-pricing";

const mockDb = db as unknown as {
  order: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
  product: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
  priceRule: { findFirst: ReturnType<typeof vi.fn> };
  discountRule: { findFirst: ReturnType<typeof vi.fn> };
  vatRate: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

function mockOrder(applyDiscount: boolean) {
  return {
    id: "order1",
    customerId: "cust1",
    branchId: "branch1",
    orderDate: new Date("2026-01-01"),
    applyDiscount,
    items: [
      {
        id: "item1",
        productId: "prod1",
        quantity: new Decimal(2),
        descriptionOverride: null,
        product: {
          sku: "M001",
          name: "ที่นอน A",
          size: null,
          unit: "หลัง",
          productTypeId: "typeA",
          productType: { code: "A", name: "TYPE A" },
        },
      },
    ],
  };
}

describe("computeOrderPreview — R3 applyDiscount (ผ่าน mocked DB)", () => {
  it("applyDiscount=true — Query DiscountRule ตามปกติ ผลเท่าพฤติกรรมเดิม", async () => {
    mockDb.order.findUniqueOrThrow.mockResolvedValue(mockOrder(true));
    mockDb.priceRule.findFirst.mockResolvedValue(null);
    mockDb.product.findUniqueOrThrow.mockResolvedValue({ standardPrice: new Decimal(1000) });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(10) });

    const preview = await computeOrderPreview("order1");

    expect(preview.groups[0].discountPct.toString()).toBe("10");
    expect(preview.groups[0].discountAmount.toString()).toBe("200"); // 2000 * 10%
    expect(preview.groups[0].netAmount.toString()).toBe("1800");
    expect(mockDb.discountRule.findFirst).toHaveBeenCalledTimes(1);
  });

  it("applyDiscount=false — discountPct/discountAmount=0, Net=Gross เต็มยอด, ไม่ Query DiscountRule เลย", async () => {
    mockDb.order.findUniqueOrThrow.mockResolvedValue(mockOrder(false));
    mockDb.priceRule.findFirst.mockResolvedValue(null);
    mockDb.product.findUniqueOrThrow.mockResolvedValue({ standardPrice: new Decimal(1000) });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(10) }); // มี Rule จริงแต่ต้องไม่ถูกใช้

    const preview = await computeOrderPreview("order1");

    expect(preview.groups[0].discountPct.toString()).toBe("0");
    expect(preview.groups[0].discountAmount.toString()).toBe("0");
    expect(preview.groups[0].netAmount.toString()).toBe("2000"); // เต็มยอด ไม่มีส่วนลด
    expect(preview.grandNet.toString()).toBe("2000");
    // ข้อสำคัญที่สุด: ต้อง "ข้าม" การ Query ไปเลย ไม่ใช่ Query แล้ว Override ทีหลัง
    expect(mockDb.discountRule.findFirst).not.toHaveBeenCalled();
  });

  it("Toggle true→false ด้วย Mock ชุดเดียวกัน — ผลต่างกันตามคาด", async () => {
    mockDb.priceRule.findFirst.mockResolvedValue(null);
    mockDb.product.findUniqueOrThrow.mockResolvedValue({ standardPrice: new Decimal(1000) });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(20) });

    mockDb.order.findUniqueOrThrow.mockResolvedValue(mockOrder(true));
    const withDiscount = await computeOrderPreview("order1");
    expect(withDiscount.grandNet.toString()).toBe("1600"); // 2000 - 20%

    mockDb.order.findUniqueOrThrow.mockResolvedValue(mockOrder(false));
    const withoutDiscount = await computeOrderPreview("order1");
    expect(withoutDiscount.grandNet.toString()).toBe("2000");
  });

  it("Toggle false→true ด้วย Mock ชุดเดียวกัน — กลับมาเท่าพฤติกรรมปกติ", async () => {
    mockDb.priceRule.findFirst.mockResolvedValue(null);
    mockDb.product.findUniqueOrThrow.mockResolvedValue({ standardPrice: new Decimal(1000) });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(15) });

    mockDb.order.findUniqueOrThrow.mockResolvedValue(mockOrder(false));
    const withoutDiscount = await computeOrderPreview("order1");
    expect(withoutDiscount.grandDiscount.toString()).toBe("0");

    mockDb.order.findUniqueOrThrow.mockResolvedValue(mockOrder(true));
    const withDiscount = await computeOrderPreview("order1");
    expect(withDiscount.grandDiscount.toString()).toBe("300"); // 2000 * 15%
  });
});

function quotationParams(applyDiscount: boolean, vatMode: "NONE" | "STANDARD" = "NONE") {
  return {
    customerId: "cust1",
    branchId: "branch1",
    quotationDate: new Date("2026-01-01"),
    vatMode,
    applyDiscount,
  };
}

const rawItems = [{ productId: "prod1", quantity: 3 }];

// ใช้ Branch Price ตรงๆ ทุกเทส (priceRule.findFirst คืนราคาให้เลย) เพื่อเลี่ยง
// STANDARD-price fallback ของ getEffectivePrice ที่ต้องพึ่ง product.standardPrice
// แยกต่างหาก — ลด Mock Shape ที่ต้องดูแลให้เหลือจุดเดียว
function mockProductForQuotation() {
  mockDb.product.findUniqueOrThrow.mockResolvedValue({
    sku: "M002",
    name: "ที่นอน B",
    size: "5 ฟุต",
    unit: "หลัง",
    productTypeId: "typeA",
    productType: { name: "TYPE A" },
  });
}

describe("computeQuotationCalc — R3 applyDiscount (ผ่าน mocked DB)", () => {
  it("applyDiscount=true — ใช้ Discount Engine เดิม 100%", async () => {
    mockProductForQuotation();
    mockDb.priceRule.findFirst.mockResolvedValue({ price: new Decimal(1000) });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(10) });

    const calc = await computeQuotationCalc(rawItems, quotationParams(true));

    expect(calc.items[0].discountAmount.toString()).not.toBe("0");
    expect(mockDb.discountRule.findFirst).toHaveBeenCalledTimes(1);
  });

  it("applyDiscount=false — discountAmount ทุกบรรทัดเป็น 0, ไม่ Query DiscountRule เลย", async () => {
    mockProductForQuotation();
    mockDb.priceRule.findFirst.mockResolvedValue({ price: new Decimal(1000) });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(10) }); // มี Rule จริงแต่ต้องไม่ถูกใช้

    const calc = await computeQuotationCalc(rawItems, quotationParams(false));

    expect(calc.items[0].discountAmount.toString()).toBe("0");
    expect(calc.discountAmount.toString()).toBe("0");
    expect(mockDb.discountRule.findFirst).not.toHaveBeenCalled();
  });

  it("VAT STANDARD + applyDiscount=true — Grand Total คำนวณถูกทั้ง Discount และ VAT ร่วมกัน", async () => {
    mockProductForQuotation();
    mockDb.priceRule.findFirst.mockResolvedValue({ price: new Decimal(1000) });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(10) });
    mockDb.vatRate.findFirst.mockResolvedValue({ ratePct: new Decimal(7) });

    const calc = await computeQuotationCalc(rawItems, quotationParams(true, "STANDARD"));

    // gross = 3*1000=3000, discount=300(10%), rawAfterDiscount=2700
    expect(calc.grossAmount.toString()).toBe("3000");
    expect(calc.discountAmount.toString()).toBe("300");
    expect(calc.grandTotal.toString()).toBe("2700"); // VAT ถอดจากยอดเดิม ไม่บวกเพิ่ม
  });

  it("VAT STANDARD + applyDiscount=false — Grand Total สูงขึ้นตามจริงเพราะไม่มีส่วนลด, VAT Logic ไม่เพี้ยน", async () => {
    mockProductForQuotation();
    mockDb.priceRule.findFirst.mockResolvedValue({ price: new Decimal(1000) });
    mockDb.discountRule.findFirst.mockResolvedValue({ discountPct: new Decimal(10) });
    mockDb.vatRate.findFirst.mockResolvedValue({ ratePct: new Decimal(7) });

    const calc = await computeQuotationCalc(rawItems, quotationParams(false, "STANDARD"));

    expect(calc.discountAmount.toString()).toBe("0");
    expect(calc.grandTotal.toString()).toBe("3000"); // เต็มยอด ไม่มีส่วนลด
    expect(calc.vatAmount.toNumber()).toBeGreaterThan(0); // VAT ยังคำนวณปกติจากฐานที่สูงขึ้น
  });
});
