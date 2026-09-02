import { describe, it, expect } from "vitest";
import { sortProductLines, type ProductLineSortInfo } from "./product-line-sort";

type Line = ProductLineSortInfo;
const identity = (l: Line) => l;

function line(id: string, familyName: string, size: string | null, familySortOrder: number | null = null): Line {
  return { id, familyName, size, familySortOrder };
}

describe("sortProductLines", () => {
  it("re-added item returns to its family group instead of appending after other families", () => {
    // Requirement ตรงตัวจาก Owner: Mary 3 / Mary 3.5 / David 3 — ลบ Mary 3 แล้วเพิ่มใหม่
    // (ไป append ท้าย Array ตาม Insertion Order) ต้องยังแสดง Mary 3, Mary 3.5, David 3
    const afterReAdd = [
      line("b", "Mary", "3.5 ฟุต", 1),
      line("c", "David", "3 ฟุต", 2),
      line("d-new", "Mary", "3 ฟุต", 1),
    ];
    const sorted = sortProductLines(afterReAdd, identity);
    expect(sorted.map((l) => `${l.familyName} ${l.size}`)).toEqual(["Mary 3 ฟุต", "Mary 3.5 ฟุต", "David 3 ฟุต"]);
  });

  it("orders sizes naturally within a family: (no size) → 3 → 3.5 → 4 → 5 → 6 → special", () => {
    const lines = [
      line("a", "GT-Mary", "6 ฟุต"),
      line("b", "GT-Mary", "3.5 ฟุต"),
      line("c", "GT-Mary", "สั่งตัด 200x180"),
      line("d", "GT-Mary", "3 ฟุต"),
      line("e", "GT-Mary", null),
      line("f", "GT-Mary", "5 ฟุต"),
      line("g", "GT-Mary", "4 ฟุต"),
    ];
    const sorted = sortProductLines(lines, identity);
    expect(sorted.map((l) => l.size)).toEqual([null, "3 ฟุต", "3.5 ฟุต", "4 ฟุต", "5 ฟุต", "6 ฟุต", "สั่งตัด 200x180"]);
  });

  it("orders families by ProductModel.sortOrder (catalog ordering) before name fallback", () => {
    // David ชื่อขึ้นก่อน Mary ตามตัวอักษร แต่ Owner จัด sortOrder ให้ Mary มาก่อนในหน้ารุ่นสินค้า
    const lines = [
      line("a", "David", "3 ฟุต", 2),
      line("b", "Mary", "3 ฟุต", 1),
    ];
    const sorted = sortProductLines(lines, identity);
    expect(sorted.map((l) => l.familyName)).toEqual(["Mary", "David"]);
  });

  it("families without any known sortOrder fall back to deterministic name order, after ranked families", () => {
    const lines = [
      line("a", "Zebra", "3 ฟุต", null),
      line("b", "Alpha", "3 ฟุต", null),
      line("c", "Mary", "3 ฟุต", 5),
    ];
    const sorted = sortProductLines(lines, identity);
    expect(sorted.map((l) => l.familyName)).toEqual(["Mary", "Alpha", "Zebra"]);
  });

  it("a client-added line with unknown sortOrder still joins its family's ranked position", () => {
    // รายการ Custom Size ที่เพิ่มจาก Edit Modal ไม่มีข้อมูลรุ่น (familySortOrder=null) —
    // กลุ่มต้องใช้ Rank ที่ดีที่สุดที่รู้จากบรรทัดอื่นในกลุ่มเดียวกัน
    const lines = [
      line("a", "David", "3 ฟุต", 2),
      line("b", "Mary", "3 ฟุต", 1),
      line("c-new", "Mary", "สั่งตัด 190x90", null),
    ];
    const sorted = sortProductLines(lines, identity);
    expect(sorted.map((l) => `${l.familyName} ${l.size}`)).toEqual([
      "Mary 3 ฟุต",
      "Mary สั่งตัด 190x90",
      "David 3 ฟุต",
    ]);
  });

  it("is deterministic for identical family+size via id tie-break and does not mutate input", () => {
    const lines = [line("z", "Mary", "3 ฟุต"), line("a", "Mary", "3 ฟุต")];
    const sorted = sortProductLines(lines, identity);
    expect(sorted.map((l) => l.id)).toEqual(["a", "z"]);
    expect(lines.map((l) => l.id)).toEqual(["z", "a"]);
  });

  // Owner UAT (2026-09-02 — Physical Print INV-A-202609-0001 จริง): อุปกรณ์เสริม
  // (ไม่มีขนาด ไม่มีรุ่น) ต้องไปอยู่ท้ายเอกสารเสมอ ไม่แทรกตามชื่อ ก-ฮ ปนกับที่นอน
  it("อุปกรณ์เสริม (Family ไม่มีขนาด+ไม่มีรุ่น) ไปท้ายเอกสาร — เคสจริงของ Owner", () => {
    const lines = [
      { id: "1", familyName: "ขาตั้งเหล็กดำ", size: null, familySortOrder: null },
      { id: "2", familyName: "ตะขอสับ", size: null, familySortOrder: null },
      { id: "3", familyName: "ที่นอนสปริง Mary", size: "3.5 ฟุต", familySortOrder: null },
      { id: "4", familyName: "ที่นอนสปริง Mary", size: "5 ฟุต", familySortOrder: null },
      { id: "5", familyName: "ที่นอนสปริง Mary", size: "6 ฟุต", familySortOrder: null },
      { id: "6", familyName: "บล็อคไม้", size: "6 ฟุต", familySortOrder: null },
      { id: "7", familyName: "บล็อคไม้", size: "5 ฟุต", familySortOrder: null },
      { id: "8", familyName: "ล้อเบรค+บล็อคสปริง", size: null, familySortOrder: null },
    ];
    const out = sortProductLines(lines, (l) => l).map((l) => l.id);
    // สินค้ามีขนาดมาก่อน (เรียงชื่อ/ไซส์ตามกติกาเดิม) — อุปกรณ์เสริมต่อท้ายเรียงตามชื่อ
    expect(out).toEqual(["3", "4", "5", "7", "6", "1", "2", "8"]);
  });

  it("Family มีรุ่น (Catalog sortOrder) แม้ไม่มีขนาด ก็ยังอยู่กลุ่มหลักตามลำดับ Catalog", () => {
    const lines = [
      { id: "a", familyName: "อุปกรณ์พิเศษมีรุ่น", size: null, familySortOrder: 1 },
      { id: "b", familyName: "ที่นอน X", size: "5 ฟุต", familySortOrder: 2 },
      { id: "c", familyName: "ตะขอ", size: null, familySortOrder: null },
    ];
    const out = sortProductLines(lines, (l) => l).map((l) => l.id);
    expect(out).toEqual(["a", "b", "c"]);
  });
});
