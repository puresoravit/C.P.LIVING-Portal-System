import { describe, expect, it } from "vitest";
import {
  formatDepartmentsText,
  formatMaxFabricsPerPlacementText,
  formatSizesText,
  getMaxFabricsForPlacement,
  parseDepartmentsText,
  parseMaxFabricsPerPlacementText,
  parseSizesText,
} from "./production-settings";

describe("parseSizesText / formatSizesText", () => {
  it("parses a comma-separated list, trimming whitespace", () => {
    expect(parseSizesText(" 3, 3.5 ,4,5, 6 , สั่งตัด ")).toEqual(["3", "3.5", "4", "5", "6", "สั่งตัด"]);
  });

  it("drops empty entries (trailing comma)", () => {
    expect(parseSizesText("3, 3.5,")).toEqual(["3", "3.5"]);
  });

  it("round-trips through format", () => {
    expect(formatSizesText(["3", "3.5", "สั่งตัด"])).toBe("3, 3.5, สั่งตัด");
  });
});

describe("parseDepartmentsText / formatDepartmentsText", () => {
  it("parses one department per line as name+copies", () => {
    expect(parseDepartmentsText("ผ้า, 3\nโครงสร้าง, 3\nBox/ฐานเตียง, 2")).toEqual([
      { name: "ผ้า", copies: 3 },
      { name: "โครงสร้าง", copies: 3 },
      { name: "Box/ฐานเตียง", copies: 2 },
    ]);
  });

  it("defaults copies to 1 when missing or invalid", () => {
    expect(parseDepartmentsText("ผ้า\nโครงสร้าง, abc")).toEqual([
      { name: "ผ้า", copies: 1 },
      { name: "โครงสร้าง", copies: 1 },
    ]);
  });

  it("skips blank lines", () => {
    expect(parseDepartmentsText("ผ้า, 3\n\n\nโครงสร้าง, 3")).toEqual([
      { name: "ผ้า", copies: 3 },
      { name: "โครงสร้าง", copies: 3 },
    ]);
  });

  it("round-trips through format", () => {
    const departments = [{ name: "ผ้า", copies: 3 }, { name: "Box", copies: 2 }];
    expect(formatDepartmentsText(departments)).toBe("ผ้า, 3\nBox, 2");
  });
});

describe("parseMaxFabricsPerPlacementText / formatMaxFabricsPerPlacementText", () => {
  it("parses placement,count lines into a map", () => {
    expect(parseMaxFabricsPerPlacementText("SIDE, 2\nWING, 3")).toEqual({ SIDE: 2, WING: 3 });
  });

  it("skips invalid or non-positive counts", () => {
    expect(parseMaxFabricsPerPlacementText("SIDE, 0\nTOP, abc\nWING, 2")).toEqual({ WING: 2 });
  });

  it("skips blank lines", () => {
    expect(parseMaxFabricsPerPlacementText("SIDE, 2\n\n\nWING, 3")).toEqual({ SIDE: 2, WING: 3 });
  });

  it("round-trips through format", () => {
    expect(formatMaxFabricsPerPlacementText({ SIDE: 2 })).toBe("SIDE, 2");
  });
});

describe("getMaxFabricsForPlacement", () => {
  it("returns the configured max for a listed placement", () => {
    expect(getMaxFabricsForPlacement({ maxFabricsPerPlacement: { SIDE: 2 } }, "SIDE")).toBe(2);
  });

  it("defaults to 1 for an unlisted placement", () => {
    expect(getMaxFabricsForPlacement({ maxFabricsPerPlacement: { SIDE: 2 } }, "TOP")).toBe(1);
    expect(getMaxFabricsForPlacement({ maxFabricsPerPlacement: {} }, "WHOLE")).toBe(1);
  });
});
