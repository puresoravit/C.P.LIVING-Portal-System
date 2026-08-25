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
    // Smoke Test R4 (2026-08-25) — Margin A4 ลดเหลือ 4mm 10mm ตามมาร์คสีแดงของ Owner
    expect(printPageStyleFor("a4")).toContain("margin: 4mm 10mm");
    expect(printPageStyleFor("continuous")).toContain("size: 9in 11in");
  });
});

// Owner UAT — Safe 9×11 PRINTED Confirmation (2026-08-24): ครอบคลุมทุก Combination
// ของ hasMarkAction × isPrinted × profile — Invariant ที่สำคัญที่สุดคือ "A4 ต้องไม่
// เปิด Confirmation Modal และไม่มาร์ค PRINTED เด็ดขาด" (showA4Notice เตือนแทน
// canOpenPrintConfirm ห้ามเป็น true เด็ดขาดเมื่อ profile==="a4" ไม่ว่า
// hasMarkAction/isPrinted จะเป็นอะไรก็ตาม) — canOpenPrintConfirm=true คุมแค่ "เปิด
// Modal ถามได้ไหม" เท่านั้น ไม่ใช่ "มาร์คให้เลยไหม" (การมาร์คจริงต้องรอผู้ใช้กด
// "พิมพ์สำเร็จ" ใน Modal เสมอ — afterprint ห้ามเขียน DB ตรงๆ อีกต่อไป)
describe("resolvePrintMarkUiState — Safe 9×11 PRINTED Confirmation gating", () => {
  it("9×11 + ยังไม่พิมพ์ + มี markPrintedAction → เปิด Confirmation Modal ได้", () => {
    const r = resolvePrintMarkUiState({ hasMarkAction: true, isPrinted: false, profile: "continuous" });
    expect(r).toEqual({ canOpenPrintConfirm: true, showA4Notice: false });
  });

  it("A4 + ยังไม่พิมพ์ → ห้ามเปิด Confirmation Modal เด็ดขาด, ขึ้นป้ายเตือนแทน", () => {
    const r = resolvePrintMarkUiState({ hasMarkAction: true, isPrinted: false, profile: "a4" });
    expect(r.canOpenPrintConfirm).toBe(false);
    expect(r.showA4Notice).toBe(true);
  });

  it("A4 + พิมพ์แล้ว → ไม่มาร์คและไม่ขึ้นป้ายเตือน (มีป้าย 'พิมพ์แล้ว' อยู่แล้ว)", () => {
    const r = resolvePrintMarkUiState({ hasMarkAction: true, isPrinted: true, profile: "a4" });
    expect(r).toEqual({ canOpenPrintConfirm: false, showA4Notice: false });
  });

  it("9×11 + พิมพ์แล้ว (Reprint) → ห้ามเปิด Confirmation Modal ซ้ำ", () => {
    const r = resolvePrintMarkUiState({ hasMarkAction: true, isPrinted: true, profile: "continuous" });
    expect(r).toEqual({ canOpenPrintConfirm: false, showA4Notice: false });
  });

  it("Invoice CANCELLED (hasMarkAction=false) → ไม่มาร์คไม่ว่า Profile ใด", () => {
    expect(resolvePrintMarkUiState({ hasMarkAction: false, isPrinted: false, profile: "continuous" }).canOpenPrintConfirm).toBe(false);
    expect(resolvePrintMarkUiState({ hasMarkAction: false, isPrinted: false, profile: "a4" }).canOpenPrintConfirm).toBe(false);
  });

  it("Invariant: canOpenPrintConfirm เป็น true ได้เฉพาะ profile==='continuous' เท่านั้น (Fuzz ทุก Combination) — พิสูจน์ A4 ไม่มีทางมาร์คได้เลย", () => {
    for (const hasMarkAction of [true, false]) {
      for (const isPrinted of [true, false]) {
        for (const profile of ["continuous", "a4"] as const) {
          const r = resolvePrintMarkUiState({ hasMarkAction, isPrinted, profile });
          if (r.canOpenPrintConfirm) expect(profile).toBe("continuous");
          if (profile === "a4") expect(r.canOpenPrintConfirm).toBe(false);
        }
      }
    }
  });
});
