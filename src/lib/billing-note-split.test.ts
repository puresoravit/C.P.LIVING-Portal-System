import { describe, it, expect } from "vitest";
import { partitionInvoicesForBilling } from "./billing-note-split";

const inv = (id: string, code: string, number: string, date: string) => ({
  id,
  productTypeCode: code,
  invoiceNumber: number,
  invoiceDate: new Date(date),
});

describe("partitionInvoicesForBilling — Auto-split ใบวางบิลตามกลุ่มส่วนลด (Smoke Test R7)", () => {
  it("ลูกค้ามีหลายกลุ่ม → แยกชุดต่อกลุ่ม เรียงกลุ่มตาม Code และภายในกลุ่มเรียงวัน→เลขที่", () => {
    const groups = partitionInvoicesForBilling([
      inv("i3", "C", "INV-C-202608-0002", "2026-08-20"),
      inv("i1", "A", "INV-A-202608-0002", "2026-08-15"),
      inv("i4", "C", "INV-C-202608-0001", "2026-08-10"),
      inv("i2", "A", "INV-A-202608-0001", "2026-08-05"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].map((g) => g.id)).toEqual(["i2", "i1"]); // กลุ่ม A เรียงตามวัน
    expect(groups[1].map((g) => g.id)).toEqual(["i4", "i3"]); // กลุ่ม C เรียงตามวัน
  });

  it("ลูกค้ากลุ่มเดียว/ไม่มีกลุ่ม → ใบเดียว เรียงตามวัน→เลขที่ (พฤติกรรมเดิม)", () => {
    const groups = partitionInvoicesForBilling([
      inv("i2", "GEN", "INV-GEN-202608-0002", "2026-08-20"),
      inv("i1", "GEN", "INV-GEN-202608-0001", "2026-08-05"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].map((g) => g.id)).toEqual(["i1", "i2"]);
  });

  it("GEN (ไม่ระบุกลุ่ม) ไปท้ายสุดเสมอเมื่อปนกับกลุ่มจริง", () => {
    const groups = partitionInvoicesForBilling([
      inv("g1", "GEN", "INV-GEN-202608-0001", "2026-08-01"),
      inv("a1", "A", "INV-A-202608-0001", "2026-08-02"),
    ]);

    expect(groups.map((g) => g[0].productTypeCode)).toEqual(["A", "GEN"]);
  });

  it("วันเดียวกัน → เรียงด้วยเลขที่ Invoice (Deterministic เสมอ)", () => {
    const groups = partitionInvoicesForBilling([
      inv("b", "A", "INV-A-202608-0002", "2026-08-10"),
      inv("a", "A", "INV-A-202608-0001", "2026-08-10"),
    ]);

    expect(groups[0].map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("ไม่มี Invoice → ไม่มีชุด (Caller Guard ไว้แล้ว แต่ Pure Function ต้องไม่พัง)", () => {
    expect(partitionInvoicesForBilling([])).toEqual([]);
  });
});

// R11 — ข้อ 7: โหมดรวมใบเดียว (ไม่แยกกลุ่มส่วนลด)
import { singleBillingGroup } from "./billing-note-split";

describe("singleBillingGroup (R11 — รวมใบเดียว)", () => {
  it("รวมทุกใบเป็นชุดเดียว เรียงตามวันที่ → เลขที่ (คละกลุ่มได้)", () => {
    const groups = singleBillingGroup([
      { id: "3", invoiceNumber: "INV-C-202608-0003", productTypeCode: "C", invoiceDate: new Date("2026-08-20") },
      { id: "1", invoiceNumber: "INV-A-202608-0001", productTypeCode: "A", invoiceDate: new Date("2026-08-05") },
      { id: "2", invoiceNumber: "INV-A-202608-0002", productTypeCode: "A", invoiceDate: new Date("2026-08-05") },
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0].map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("ไม่มีใบเลย = ไม่มีชุด (ไม่สร้างใบวางบิลว่าง)", () => {
    expect(singleBillingGroup([])).toEqual([]);
  });
});
