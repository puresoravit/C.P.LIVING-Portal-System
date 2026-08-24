import { describe, it, expect } from "vitest";
import { PRINT_PROFILES, DEFAULT_PRINT_PROFILE, printPageStyleFor, resolvePrintMarkUiState } from "./print-settings";

describe("print-settings", () => {
  it("มี 2 profile ตามที่อนุมัติ: continuous (9x11) และ a4", () => {
    expect(Object.keys(PRINT_PROFILES).sort()).toEqual(["a4", "continuous"]);
    expect(PRINT_PROFILES.continuous.pageSize).toBe("9in 11in");
    expect(PRINT_PROFILES.a4.pageSize).toBe("A4");
  });

  it("default profile ต้องเป็น continuous (ตรงกับเครื่องพิมพ์ที่ใช้งานจริง)", () => {
    expect(DEFAULT_PRINT_PROFILE).toBe("continuous");
  });

  it("printPageStyleFor สร้าง @page rule ที่ถูก profile", () => {
    expect(printPageStyleFor("a4")).toContain("size: A4");
    expect(printPageStyleFor("a4")).toContain("margin: 10mm 12mm");
    expect(printPageStyleFor("continuous")).toContain("size: 9in 11in");
  });
});

// Owner UAT — Automatic PRINTED Workflow (2026-08-24): ครอบคลุมทุก Combination ของ
// hasMarkAction × isPrinted × profile — Invariant ที่สำคัญที่สุดคือ "A4 ต้องไม่มาร์ค
// PRINTED อัตโนมัติเด็ดขาด" (showA4Notice เตือนแทน canAutoMark ห้ามเป็น true เด็ดขาด
// เมื่อ profile==="a4" ไม่ว่า hasMarkAction/isPrinted จะเป็นอะไรก็ตาม)
describe("resolvePrintMarkUiState — Automatic PRINTED Workflow gating", () => {
  it("9×11 + ยังไม่พิมพ์ + มี markPrintedAction → เปิด Auto-mark", () => {
    const r = resolvePrintMarkUiState({ hasMarkAction: true, isPrinted: false, profile: "continuous" });
    expect(r).toEqual({ canAutoMark: true, showA4Notice: false });
  });

  it("A4 + ยังไม่พิมพ์ → ห้าม Auto-mark เด็ดขาด, ขึ้นป้ายเตือนแทน", () => {
    const r = resolvePrintMarkUiState({ hasMarkAction: true, isPrinted: false, profile: "a4" });
    expect(r.canAutoMark).toBe(false);
    expect(r.showA4Notice).toBe(true);
  });

  it("A4 + พิมพ์แล้ว → ไม่มาร์คและไม่ขึ้นป้ายเตือน (มีป้าย 'พิมพ์แล้ว' อยู่แล้ว)", () => {
    const r = resolvePrintMarkUiState({ hasMarkAction: true, isPrinted: true, profile: "a4" });
    expect(r).toEqual({ canAutoMark: false, showA4Notice: false });
  });

  it("9×11 + พิมพ์แล้ว (Reprint) → ห้ามมาร์คซ้ำ", () => {
    const r = resolvePrintMarkUiState({ hasMarkAction: true, isPrinted: true, profile: "continuous" });
    expect(r).toEqual({ canAutoMark: false, showA4Notice: false });
  });

  it("Invoice CANCELLED (hasMarkAction=false) → ไม่มาร์คไม่ว่า Profile ใด", () => {
    expect(resolvePrintMarkUiState({ hasMarkAction: false, isPrinted: false, profile: "continuous" }).canAutoMark).toBe(false);
    expect(resolvePrintMarkUiState({ hasMarkAction: false, isPrinted: false, profile: "a4" }).canAutoMark).toBe(false);
  });

  it("Invariant: canAutoMark เป็น true ได้เฉพาะ profile==='continuous' เท่านั้น (Fuzz ทุก Combination)", () => {
    for (const hasMarkAction of [true, false]) {
      for (const isPrinted of [true, false]) {
        for (const profile of ["continuous", "a4"] as const) {
          const r = resolvePrintMarkUiState({ hasMarkAction, isPrinted, profile });
          if (r.canAutoMark) expect(profile).toBe("continuous");
          if (profile === "a4") expect(r.canAutoMark).toBe(false);
        }
      }
    }
  });
});
