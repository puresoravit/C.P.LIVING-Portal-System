import { describe, it, expect } from "vitest";
import { sumActiveInvoiceTotal } from "./order-doc-center";

describe("sumActiveInvoiceTotal", () => {
  it("Active Invoice ทุกใบ → รวมครบ", () => {
    const total = sumActiveInvoiceTotal([
      { status: "CONFIRMED", grandTotal: 1000 },
      { status: "PRINTED", grandTotal: 500 },
    ]);
    expect(total.toNumber()).toBe(1500);
  });

  it("Active + CANCELLED ปนกัน → ไม่นับ CANCELLED", () => {
    const total = sumActiveInvoiceTotal([
      { status: "CONFIRMED", grandTotal: 1000 },
      { status: "CANCELLED", grandTotal: 9999 },
    ]);
    expect(total.toNumber()).toBe(1000);
  });

  it("CANCELLED ทั้งหมด → total = 0", () => {
    const total = sumActiveInvoiceTotal([
      { status: "CANCELLED", grandTotal: 1000 },
      { status: "CANCELLED", grandTotal: 500 },
    ]);
    expect(total.toNumber()).toBe(0);
  });

  it("ไม่มี Invoice เลย → total = 0", () => {
    expect(sumActiveInvoiceTotal([]).toNumber()).toBe(0);
  });

  it("E3 มี Invoice รุ่นเก่าหลายใบ CANCELLED + รุ่นใหม่ Active → รวมเฉพาะรุ่นใหม่ ไม่ยอดซ้ำ", () => {
    // จำลอง Order ที่ถูกแก้ผ่าน E3 สองครั้ง: รุ่น 1 (2 ใบ, cancelled), รุ่น 2 (2 ใบ, cancelled),
    // รุ่น 3 (2 ใบ, active) — ต้องได้ยอดของรุ่น 3 เท่านั้น
    const total = sumActiveInvoiceTotal([
      { status: "CANCELLED", grandTotal: 2140 }, // รุ่น 1 - A
      { status: "CANCELLED", grandTotal: 642 }, // รุ่น 1 - B
      { status: "CANCELLED", grandTotal: 2140 }, // รุ่น 2 - A
      { status: "CANCELLED", grandTotal: 700 }, // รุ่น 2 - B
      { status: "CONFIRMED", grandTotal: 2140 }, // รุ่น 3 - A (active)
      { status: "PRINTED", grandTotal: 800 }, // รุ่น 3 - B (active)
    ]);
    expect(total.toNumber()).toBe(2940);
  });
});
