import { describe, it, expect } from "vitest";
import { parseDocNumber } from "./running-number-reclaim";

describe("parseDocNumber (อ่านเพื่อเทียบ lastSeq เท่านั้น — Owner UAT 2026-08-31)", () => {
  it("แยก period/seq กลับจาก formatDocNumber ได้ตรงกันทุก docType", () => {
    expect(parseDocNumber("ORDER", "ORDER-202608-00125")).toEqual({ period: "202608", seq: 125 });
    expect(parseDocNumber("QT", "QT-202608-00007")).toEqual({ period: "202608", seq: 7 });
    expect(parseDocNumber("TX", "TX-202608-003")).toEqual({ period: "202608", seq: 3 });
  });

  it("docType ที่มี '-' ปนอยู่เอง (เช่น INV-A) ยังแยก period ถูก ไม่หลุดไปรวมกับ docType", () => {
    expect(parseDocNumber("INV-A", "INV-A-202608-0081")).toEqual({ period: "202608", seq: 81 });
    expect(parseDocNumber("INV-B", "INV-B-202608-0044")).toEqual({ period: "202608", seq: 44 });
  });

  it("คืน null ถ้า docType ไม่ตรง prefix หรือรูปแบบผิด", () => {
    expect(parseDocNumber("INV-A", "INV-B-202608-0044")).toBeNull();
    expect(parseDocNumber("ORDER", "ORDER-202608")).toBeNull();
    expect(parseDocNumber("ORDER", "not-a-doc-number")).toBeNull();
  });
});
