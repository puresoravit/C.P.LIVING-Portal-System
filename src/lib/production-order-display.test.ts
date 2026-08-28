import { describe, expect, it } from "vitest";
import { displayProdNo } from "./production-order-display";

describe("displayProdNo", () => {
  it("returns the plain prodNo when revNo is 0", () => {
    expect(displayProdNo("PROD-202608-00001", 0)).toBe("PROD-202608-00001");
  });

  it("appends -N suffix when revNo > 0", () => {
    expect(displayProdNo("PROD-202608-00001", 2)).toBe("PROD-202608-00001-2");
  });
});
