import { describe, it, expect } from "vitest";
import { LINE_TEXT_MAX_CHARS, composeLineName, lineNoteCapacity, lineNoteError, lineNoteRemaining, visibleLength } from "./line-note";

describe("line-note — หมายเหตุต่อท้ายชื่อสินค้าในวงเล็บ (Owner 2026-09-04)", () => {
  it("นับตัวอักษรไทยที่มองเห็น ไม่นับสระ/วรรณยุกต์แยก", () => {
    expect(visibleLength("ที่นอน")).toBe(4); // ที่ = ท + ี + ่ = 1 ตัวที่มองเห็น
    expect(visibleLength("Mary")).toBe(4);
    expect(visibleLength("")).toBe(0);
  });

  it("compose: มีหมายเหตุ → ชื่อ (หมายเหตุ), ไม่มี/ว่าง → ชื่อเฉยๆ", () => {
    expect(composeLineName("ที่นอนสปริง Mary", "สินค้าตัวอย่าง")).toBe("ที่นอนสปริง Mary (สินค้าตัวอย่าง)");
    expect(composeLineName("ที่นอนสปริง Mary", "  ")).toBe("ที่นอนสปริง Mary");
    expect(composeLineName("ที่นอนสปริง Mary", null)).toBe("ที่นอนสปริง Mary");
    expect(composeLineName("ที่นอนสปริง Mary", " ตัวอย่าง ")).toBe("ที่นอนสปริง Mary (ตัวอย่าง)");
  });

  it("โควตายืดหยุ่นตามความยาวชื่อ: ชื่อยาวเหลือน้อย ชื่อสั้นเหลือเยอะ", () => {
    const short = "Mary"; // 4
    const long = "x".repeat(40);
    expect(lineNoteCapacity(short)).toBe(LINE_TEXT_MAX_CHARS - 3 - 4);
    expect(lineNoteCapacity(long)).toBe(LINE_TEXT_MAX_CHARS - 3 - 40);
    expect(lineNoteCapacity("x".repeat(80))).toBe(0); // ชื่อยาวเกินบรรทัดอยู่แล้ว → ใส่ไม่ได้เลย
    expect(lineNoteRemaining(short, "abc")).toBe(LINE_TEXT_MAX_CHARS - 3 - 4 - 3);
  });

  it("error เฉพาะตอนรวมแล้วเกิน 1 บรรทัด — ไม่มีหมายเหตุผ่านเสมอแม้ชื่อยาว", () => {
    const name = "x".repeat(40);
    expect(lineNoteError(name, "")).toBeNull();
    expect(lineNoteError("x".repeat(80), null)).toBeNull();
    expect(lineNoteError(name, "y".repeat(LINE_TEXT_MAX_CHARS - 3 - 40))).toBeNull(); // พอดีบรรทัด
    expect(lineNoteError(name, "y".repeat(LINE_TEXT_MAX_CHARS - 3 - 40 + 1))).toMatch(/ยาวเกิน 1 ตัวอักษร/);
  });
});
