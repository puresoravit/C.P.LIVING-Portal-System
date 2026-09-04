import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { INVOICE_MAX_LINES, chunkInvoiceLines, invoiceLineRawMatches, reconcileGroupInvoices, type InvoiceRawLine } from "./invoice-split";
import { PRINTED_SHEET_BLOCK } from "./invoice-sheets";

const line = (n: number, over: Partial<InvoiceRawLine> = {}): InvoiceRawLine => ({
  productId: `p${n}`, skuSnapshot: `SKU-${n}`, productNameSnapshot: `สินค้า ${n}`, sizeSnapshot: "5 ฟุต",
  quantity: new Decimal(1), unitSnapshot: "หลัง", unitPriceSnapshot: new Decimal(1000), grossAmount: new Decimal(1000), ...over,
});
const lines = (n: number, from = 1) => Array.from({ length: n }, (_, i) => line(from + i));
const inv = (id: string, no: string, printed: boolean, ls: InvoiceRawLine[], pct = 0) => ({ id, invoiceNumber: no, printed, discountPct: pct, lines: ls });

describe("chunkInvoiceLines — ใบละไม่เกิน 14 รายการ (Owner 2026-09-04)", () => {
  it("14 → [14], 15 → [14,1], 30 → [14,14,2], 0 → []", () => {
    expect(INVOICE_MAX_LINES).toBe(14);
    expect(chunkInvoiceLines(lines(14)).map((c) => c.length)).toEqual([14]);
    expect(chunkInvoiceLines(lines(15)).map((c) => c.length)).toEqual([14, 1]);
    expect(chunkInvoiceLines(lines(30)).map((c) => c.length)).toEqual([14, 14, 2]);
    expect(chunkInvoiceLines([])).toEqual([]);
  });
  it("คงลำดับรายการเดิม (ลำดับใน 1 ใบเริ่ม 1 ใหม่ = index ในก้อน)", () => {
    const c = chunkInvoiceLines(lines(16));
    expect(c[0][0].productId).toBe("p1");
    expect(c[1][0].productId).toBe("p15");
  });
});

describe("invoiceLineRawMatches — เทียบเฉพาะฟิลด์ที่ไม่ขึ้นกับเพื่อนร่วมใบ", () => {
  it("เท่ากันแม้ Decimal คนละ instance / string", () => {
    expect(invoiceLineRawMatches(line(1), { ...line(1), quantity: "1.00", unitPriceSnapshot: 1000, grossAmount: "1000" })).toBe(true);
  });
  it("จำนวน/ราคา/ชื่อ/ขนาดต่าง = ไม่ตรง", () => {
    expect(invoiceLineRawMatches(line(1), line(1, { quantity: new Decimal(2) }))).toBe(false);
    expect(invoiceLineRawMatches(line(1), line(1, { productNameSnapshot: "สินค้า 1 (หมายเหตุ)" }))).toBe(false);
    expect(invoiceLineRawMatches(line(1), line(1, { sizeSnapshot: null }))).toBe(false);
  });
});

describe("reconcileGroupInvoices — 1 กลุ่มส่วนลด = N ใบ", () => {
  it("Confirm ครั้งแรก (ไม่มีใบเดิม): 30 รายการ → creates [14,14,2]", () => {
    const plan = reconcileGroupInvoices({ existing: [], newLines: lines(30), groupDiscountPct: 5 });
    expect(plan.creates.map((c) => c.length)).toEqual([14, 14, 2]);
    expect(plan.assignments).toEqual([]);
    expect(plan.cancels).toEqual([]);
    expect(plan.frozen).toEqual([]);
  });

  it("ไม่มีใบพิมพ์: จัดใหม่ลงใบเดิมตามลำดับเลข เกิน = ใบใหม่ ว่าง = ยกเลิก", () => {
    const existing = [inv("b", "INV-A-202609-0002", false, lines(2, 15)), inv("a", "INV-A-202609-0001", false, lines(14))];
    // เพิ่มเป็น 31 รายการ → [14,14,3]: 0001, 0002 ใช้เลขเดิม + ใบใหม่ 1 ใบ
    const grow = reconcileGroupInvoices({ existing, newLines: lines(31), groupDiscountPct: 0 });
    expect(grow.assignments.map((a) => [a.invoiceNumber, a.lines.length])).toEqual([["INV-A-202609-0001", 14], ["INV-A-202609-0002", 14]]);
    expect(grow.creates.map((c) => c.length)).toEqual([3]);
    expect(grow.cancels).toEqual([]);
    // ลดเหลือ 10 รายการ → 0001 ได้ 10, 0002 ว่าง → ยกเลิก
    const shrink = reconcileGroupInvoices({ existing, newLines: lines(10), groupDiscountPct: 0 });
    expect(shrink.assignments.map((a) => [a.invoiceNumber, a.lines.length])).toEqual([["INV-A-202609-0001", 10]]);
    expect(shrink.cancels.map((c) => c.invoiceNumber)).toEqual(["INV-A-202609-0002"]);
    expect(shrink.creates).toEqual([]);
  });

  it("ใบพิมพ์แล้วแช่แข็ง: รายการของใบนั้นถูกดึงออกก่อน ที่เหลือจัดลงใบยังไม่พิมพ์/ใบใหม่", () => {
    const printed = inv("a", "INV-A-202609-0001", true, lines(14));
    const open = inv("b", "INV-A-202609-0002", false, lines(2, 15));
    // เพิ่มรายการใหม่ 3 ตัว (17..19) — ลำดับรวมชุดใหม่: 1..19
    const plan = reconcileGroupInvoices({ existing: [printed, open], newLines: lines(19), groupDiscountPct: 0 });
    expect(plan.frozen.map((f) => f.invoiceNumber)).toEqual(["INV-A-202609-0001"]);
    expect(plan.assignments.map((a) => [a.invoiceNumber, a.lines.map((l) => l.productId)])).toEqual([
      ["INV-A-202609-0002", ["p15", "p16", "p17", "p18", "p19"]],
    ]);
    expect(plan.creates).toEqual([]);
  });

  it("เพิ่มเข้ากลุ่มที่ใบเดียวพิมพ์แล้ว (แม้ไม่เต็ม 14) → ใบใหม่เฉพาะรายการที่เพิ่ม", () => {
    const printed = inv("a", "INV-A-202609-0001", true, lines(10));
    const plan = reconcileGroupInvoices({ existing: [printed], newLines: lines(12), groupDiscountPct: 0 });
    expect(plan.frozen).toHaveLength(1);
    expect(plan.assignments).toEqual([]);
    expect(plan.creates.map((c) => c.map((l) => l.productId))).toEqual([["p11", "p12"]]);
  });

  it("แก้จำนวน/ลบรายการที่อยู่ในใบพิมพ์แล้ว → BLOCK พร้อมเหตุผล (Prefix เดียวกับ Sheet Engine)", () => {
    const printed = inv("a", "INV-A-202609-0001", true, lines(3));
    const changedQty = [line(1), line(2, { quantity: new Decimal(9) }), line(3)];
    expect(() => reconcileGroupInvoices({ existing: [printed], newLines: changedQty, groupDiscountPct: 0 })).toThrow(new RegExp(`^${PRINTED_SHEET_BLOCK}:.*สินค้า 2`));
    expect(() => reconcileGroupInvoices({ existing: [printed], newLines: [line(1), line(3)], groupDiscountPct: 0 })).toThrow(/สินค้า 2/);
  });

  it("% ส่วนลดกลุ่มเปลี่ยนโดยมีใบพิมพ์แล้ว → BLOCK (ยอดบนกระดาษจะไม่ตรง)", () => {
    const printed = inv("a", "INV-A-202609-0001", true, lines(3), 5);
    expect(() => reconcileGroupInvoices({ existing: [printed], newLines: lines(3), groupDiscountPct: 10 })).toThrow(/ส่วนลดของกลุ่มเปลี่ยน/);
    expect(() => reconcileGroupInvoices({ existing: [printed], newLines: lines(3), groupDiscountPct: "5.00" })).not.toThrow();
  });

  it("รายการซ้ำสินค้าเดียวกันหลายบรรทัด: จับคู่ทีละบรรทัดไม่ซ้ำกัน", () => {
    const dup = [line(1), line(1), line(2)];
    const printed = inv("a", "INV-A-202609-0001", true, [line(1), line(1)]);
    const plan = reconcileGroupInvoices({ existing: [printed], newLines: dup, groupDiscountPct: 0 });
    expect(plan.creates.map((c) => c.map((l) => l.productId))).toEqual([["p2"]]);
    // เหลือบรรทัดซ้ำแค่ 1 → บรรทัดที่ 2 ของใบพิมพ์แล้วหาย → BLOCK
    expect(() => reconcileGroupInvoices({ existing: [printed], newLines: [line(1), line(2)], groupDiscountPct: 0 })).toThrow(/สินค้า 1/);
  });

  it("ทุกใบเดิมต้องมีปลายทางพอดี 1 ที่ (frozen / assignment / cancel) และรายการทุกบรรทัดลงใบพอดี 1 ที่", () => {
    const existing = [inv("a", "INV-A-202609-0001", true, lines(14)), inv("b", "INV-A-202609-0002", false, lines(14, 15)), inv("c", "INV-A-202609-0003", false, lines(2, 29))];
    const plan = reconcileGroupInvoices({ existing, newLines: lines(20), groupDiscountPct: 0 });
    const ids = [...plan.frozen.map((f) => f.invoiceId), ...plan.assignments.map((a) => a.invoiceId), ...plan.cancels.map((c) => c.invoiceId)].sort();
    expect(ids).toEqual(["a", "b", "c"]);
    const placed = plan.assignments.flatMap((a) => a.lines).length + plan.creates.flat().length + plan.frozen.reduce((s, f) => s + existing.find((e) => e.id === f.invoiceId)!.lines.length, 0);
    expect(placed).toBe(20);
  });
});
