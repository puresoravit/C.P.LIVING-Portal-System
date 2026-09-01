import { describe, it, expect } from "vitest";
import { planSheetSplit, deriveSheetPrintState, INVOICE_SHEET_CAPACITY } from "./invoice-sheets";

describe("planSheetSplit — ใช้ความจุ Owner-approved (17/14/14) ตัวเดียวกับหน้า Print", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("ความจุตรงกับ DOC_CAPACITY_APPROVED.INVOICE", () => {
    expect(INVOICE_SHEET_CAPACITY).toEqual({ normalPageRows: 17, finalAloneRows: 14, finalOfMultiRows: 14 });
  });

  it("Owner Matrix: 14→1 แผ่น / 15→[14,1] / 35→[17,17,1]", () => {
    expect(planSheetSplit(rows(14)).map((p) => p.length)).toEqual([14]);
    expect(planSheetSplit(rows(15)).map((p) => p.length)).toEqual([14, 1]);
    expect(planSheetSplit(rows(35)).map((p) => p.length)).toEqual([17, 17, 1]);
  });
});

describe("deriveSheetPrintState — สถานะสรุปใบหลักจากแผ่น (Owner: UNPRINTED/PARTIAL/PRINTED)", () => {
  const sheet = (printed: boolean, voided = false) => ({
    printedAt: printed ? new Date() : null,
    voidedAt: voided ? new Date() : null,
  });

  it("ไม่มีแผ่นพิมพ์เลย = UNPRINTED", () => {
    expect(deriveSheetPrintState([sheet(false), sheet(false)])).toBe("UNPRINTED");
  });

  it("พิมพ์บางแผ่น = PARTIAL", () => {
    expect(deriveSheetPrintState([sheet(true), sheet(false)])).toBe("PARTIAL");
  });

  it("พิมพ์ครบทุกแผ่น Active = PRINTED", () => {
    expect(deriveSheetPrintState([sheet(true), sheet(true)])).toBe("PRINTED");
  });

  it("แผ่น Voided ไม่ถูกนับ (แผ่นถูกยุบไม่บังคับให้พิมพ์)", () => {
    expect(deriveSheetPrintState([sheet(true), sheet(false, true)])).toBe("PRINTED");
  });

  it("ไม่มีแผ่นเลย (ใบเก่า) = UNPRINTED — จุดเรียกใช้ต้อง Fallback ไปสถานะใบหลักเอง", () => {
    expect(deriveSheetPrintState([])).toBe("UNPRINTED");
  });
});
