import { describe, it, expect } from "vitest";
import {
  mergeTemplateSettings,
  validateLogoDataUri,
  buildPrintCssVars,
  DEFAULT_GLOBAL_TEMPLATE_SETTINGS,
  LOGO_MAX_BYTES,
  type GlobalTemplateSettings,
} from "./print-template-settings";

describe("mergeTemplateSettings", () => {
  it("ไม่มี Override เลย (null) — คืนค่า Global ล้วนๆ", () => {
    const result = mergeTemplateSettings(DEFAULT_GLOBAL_TEMPLATE_SETTINGS, null);
    expect(result).toEqual(DEFAULT_GLOBAL_TEMPLATE_SETTINGS);
  });

  it("Override บางส่วน — Field ที่ระบุทับ Global, Field อื่นยังใช้ Global", () => {
    const result = mergeTemplateSettings(DEFAULT_GLOBAL_TEMPLATE_SETTINGS, { showPhone: false });
    expect(result.showPhone).toBe(false);
    expect(result.showAddress).toBe(DEFAULT_GLOBAL_TEMPLATE_SETTINGS.showAddress);
    expect(result.fontFamily).toBe(DEFAULT_GLOBAL_TEMPLATE_SETTINGS.fontFamily);
  });

  it("Override เต็มชุด (ไม่รวม logoSize) — logoSize ยังคงมาจาก Global เสมอ", () => {
    const global: GlobalTemplateSettings = { ...DEFAULT_GLOBAL_TEMPLATE_SETTINGS, logoSize: "large" };
    const result = mergeTemplateSettings(global, {
      showAddress: false,
      showPhone: false,
      showTaxId: false,
      footerNote: "Custom",
      fontFamily: "tahoma",
      bodyFontSize: "compact",
      headingFontSize: "large",
      spacingDensity: "relaxed",
      contentPadding: "medium",
    });
    expect(result.logoSize).toBe("large"); // ไม่ถูก Override เพราะ Type ไม่มี Field นี้เลย
    expect(result.fontFamily).toBe("tahoma");
  });
});

describe("validateLogoDataUri", () => {
  function makeDataUri(mime: string, byteLength: number): string {
    const base64 = Buffer.alloc(byteLength, 1).toString("base64");
    return `data:${mime};base64,${base64}`;
  }

  it("PNG ขนาดเล็ก — ผ่าน", () => {
    const result = validateLogoDataUri(makeDataUri("image/png", 1000));
    expect(result.valid).toBe(true);
  });

  it("JPEG พอดี 200KB — ผ่าน", () => {
    const result = validateLogoDataUri(makeDataUri("image/jpeg", LOGO_MAX_BYTES));
    expect(result.valid).toBe(true);
  });

  it("WebP เกิน 200KB — ไม่ผ่าน", () => {
    const result = validateLogoDataUri(makeDataUri("image/webp", LOGO_MAX_BYTES + 1));
    expect(result.valid).toBe(false);
  });

  it("SVG — Reject เสมอ (ความเสี่ยง XSS) แม้ขนาดเล็กมาก", () => {
    const result = validateLogoDataUri(makeDataUri("image/svg+xml", 10));
    expect(result.valid).toBe(false);
  });

  it("GIF — ไม่อยู่ใน Allowlist ไม่ผ่าน", () => {
    const result = validateLogoDataUri(makeDataUri("image/gif", 10));
    expect(result.valid).toBe(false);
  });

  it("รูปแบบไม่ใช่ Data URI เลย — ไม่ผ่าน ไม่ Throw", () => {
    const result = validateLogoDataUri("not-a-data-uri");
    expect(result.valid).toBe(false);
  });
});

describe("buildPrintCssVars — Default ต้องตรงกับพฤติกรรม Hardcode เดิมเป๊ะ (Zero-Regression)", () => {
  it("Global Default ทั้งชุด → CSS Var ตรงกับค่าที่เคย Hardcode ไว้ในทุก Shared Print Component", () => {
    const vars = buildPrintCssVars(DEFAULT_GLOBAL_TEMPLATE_SETTINGS);
    expect(vars["--print-body-size"]).toBe("12px"); // เดิม text-xs
    expect(vars["--print-heading-size"]).toBe("14px"); // เดิม text-sm
    expect(vars["--print-row-padding"]).toBe("4px"); // เดิม py-1
    expect(vars["--print-block-gap"]).toBe("6px"); // เดิม mb-1.5
    expect(vars["--print-content-padding"]).toBe("0mm"); // เดิม print:p-0
    expect(vars["--print-font-family"]).toContain("Sarabun");
  });

  it("เปลี่ยน bodyFontSize เป็น large — เฉพาะ --print-body-size เปลี่ยน ตัวอื่นไม่กระทบ", () => {
    const vars = buildPrintCssVars({ ...DEFAULT_GLOBAL_TEMPLATE_SETTINGS, bodyFontSize: "large" });
    expect(vars["--print-body-size"]).toBe("13px");
    expect(vars["--print-heading-size"]).toBe("14px");
  });
});
