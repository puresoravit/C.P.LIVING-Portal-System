import { describe, it, expect } from "vitest";
import { PRINT_PROFILES, DEFAULT_PRINT_PROFILE, printPageStyleFor } from "./print-settings";

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
