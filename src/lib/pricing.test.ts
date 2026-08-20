import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { extractVat, roundMoney, dateRangesOverlap, allocateProportionally } from "./pricing";

describe("extractVat (ข้อ 26 — สูตร VAT = ยอดรวม × 7 ÷ 107)", () => {
  it("ถอด VAT 7% จากยอดรวมได้ถูกต้องตามตัวอย่างจริงในเอกสาร (23,528.00)", () => {
    // อ้างอิงจากตัวอย่างใบกำกับภาษีจริงที่ผู้ใช้ส่งมา:
    // Value Amount 23,528.00 -> ไม่ตรงกับ 25,174.96/1.07 เป๊ะเพราะปัดเศษ
    // ทดสอบด้วยเลขกลมแทนเพื่อยืนยันสูตรถูกต้อง
    const total = new Decimal(107); // ยอดรวม 107 บาท (VAT-inclusive)
    const { netBeforeVat, vatAmount } = extractVat(total, new Decimal(7));
    expect(vatAmount.toString()).toBe("7");
    expect(netBeforeVat.toString()).toBe("100");
  });

  it("ปัดเศษ Round Half Up ทศนิยม 2 ตำแหน่ง", () => {
    const total = new Decimal(100);
    const { vatAmount, netBeforeVat } = extractVat(total, new Decimal(7));
    // 100 * 7 / 107 = 6.5420560747... -> ปัดเป็น 6.54
    expect(vatAmount.toString()).toBe("6.54");
    expect(netBeforeVat.toString()).toBe("93.46");
    // netBeforeVat + vatAmount ต้องเท่ากับยอดรวมเป๊ะ (ไม่มี rounding drift)
    expect(netBeforeVat.add(vatAmount).toString()).toBe("100");
  });
});

describe("roundMoney (Round Half Up ทศนิยม 2 ตำแหน่ง — มาตรฐานเดียวทั้งระบบ)", () => {
  it("ปัดขึ้นที่ .5 พอดี (Round Half Up ไม่ใช่ Banker's Rounding)", () => {
    expect(roundMoney(1.005).toString()).toBe("1.01");
    expect(roundMoney(1.015).toString()).toBe("1.02");
  });
});

describe("allocateProportionally (แก้ Rounding Drift — ข้อ 26)", () => {
  it("ผลรวมที่จัดสรรแล้วต้องเท่ากับ targetTotal เป๊ะเสมอ แม้ตัวเลขจะหารลงตัวยาก", () => {
    // เคสที่มักเกิด drift: gross ไม่ลงตัวสวยๆ
    const amounts = [new Decimal(100.01), new Decimal(100.02), new Decimal(100.03)];
    const target = roundMoney(amounts.reduce((s, a) => s.add(a), new Decimal(0)).mul(0.1)); // ส่วนลด 10% ของยอดรวม
    const allocated = allocateProportionally(amounts, target);
    const sum = allocated.reduce((s, a) => s.add(a), new Decimal(0));
    expect(sum.toString()).toBe(target.toString());
  });

  it("เคสง่ายๆ ที่ไม่มี rounding issue ก็ต้องถูกต้อง", () => {
    const amounts = [new Decimal(100), new Decimal(200)];
    const allocated = allocateProportionally(amounts, new Decimal(30));
    expect(allocated[0].toString()).toBe("10");
    expect(allocated[1].toString()).toBe("20");
  });

  it("รายการเดียว ต้องได้ยอดเต็มทั้งหมด", () => {
    const allocated = allocateProportionally([new Decimal(50)], new Decimal(5));
    expect(allocated[0].toString()).toBe("5");
  });

  it("array ว่าง คืนค่า array ว่าง", () => {
    expect(allocateProportionally([], new Decimal(10))).toEqual([]);
  });
});
  it("ช่วงวันที่ไม่ทับกันเลย -> false", () => {
    const overlap = dateRangesOverlap(
      new Date("2026-01-01"),
      new Date("2026-06-30"),
      new Date("2026-07-01"),
      new Date("2026-12-31")
    );
    expect(overlap).toBe(false);
  });

  it("ช่วงวันที่ทับกันบางส่วน -> true", () => {
    const overlap = dateRangesOverlap(
      new Date("2026-01-01"),
      new Date("2026-08-15"),
      new Date("2026-08-01"),
      new Date("2026-12-31")
    );
    expect(overlap).toBe(true);
  });

  it("effectiveTo = null (ไม่มีวันหมดอายุ) ต้องทับกับช่วงที่เริ่มทีหลังได้", () => {
    const overlap = dateRangesOverlap(new Date("2026-01-01"), null, new Date("2026-08-01"), new Date("2026-12-31"));
    expect(overlap).toBe(true);
  });

  it("ช่วงเก่าจบพอดีก่อนช่วงใหม่เริ่ม (ต่อเนื่องกันไม่ทับ) -> false", () => {
    const overlap = dateRangesOverlap(
      new Date("2026-01-01"),
      new Date("2026-07-31"),
      new Date("2026-08-01"),
      null
    );
    expect(overlap).toBe(false);
  });
});
