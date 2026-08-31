import { describe, it, expect } from "vitest";
import { stripUnitToNumber, formatWaddingWeight, formatFoamThickness } from "./fabric-unit-format";

describe("stripUnitToNumber", () => {
  it("strips 'g' suffix with no space", () => {
    expect(stripUnitToNumber("280g")).toBe("280");
  });
  it("strips 'mm' suffix with a space", () => {
    expect(stripUnitToNumber("10 mm")).toBe("10");
  });
  it("strips 'mm' suffix with no space (legacy inconsistent data)", () => {
    expect(stripUnitToNumber("15mm")).toBe("15");
  });
  it("passes through a bare number unchanged", () => {
    expect(stripUnitToNumber("350")).toBe("350");
  });
  it("keeps decimals", () => {
    expect(stripUnitToNumber("2.3mm")).toBe("2.3");
  });
  it("returns trimmed input as-is when it doesn't start with a number", () => {
    expect(stripUnitToNumber("")).toBe("");
  });
});

describe("formatWaddingWeight", () => {
  it("appends g with no space", () => {
    expect(formatWaddingWeight("280")).toBe("280g");
  });
  it("returns empty string for empty input", () => {
    expect(formatWaddingWeight("")).toBe("");
  });
});

describe("formatFoamThickness", () => {
  it("appends mm with a space", () => {
    expect(formatFoamThickness("10")).toBe("10 mm");
  });
  it("returns empty string for empty input", () => {
    expect(formatFoamThickness("")).toBe("");
  });
});
