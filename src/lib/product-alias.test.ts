import { describe, expect, it } from "vitest";
import { normalizeAliasText, resolveAliasFamilyHead, validateAliasScope } from "./product-alias";

describe("resolveAliasFamilyHead", () => {
  it("returns model head when only productModelId is set", () => {
    expect(resolveAliasFamilyHead({ productModelId: "m1", productId: null })).toEqual({ kind: "model", id: "m1" });
  });

  it("returns product head when only productId is set", () => {
    expect(resolveAliasFamilyHead({ productModelId: null, productId: "p1" })).toEqual({ kind: "product", id: "p1" });
  });

  it("returns null when both are set", () => {
    expect(resolveAliasFamilyHead({ productModelId: "m1", productId: "p1" })).toBeNull();
  });

  it("returns null when neither is set", () => {
    expect(resolveAliasFamilyHead({ productModelId: null, productId: null })).toBeNull();
    expect(resolveAliasFamilyHead({})).toBeNull();
  });
});

describe("normalizeAliasText", () => {
  it("lowercases and trims", () => {
    expect(normalizeAliasText("  David  ")).toBe("david");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeAliasText("Box   David")).toBe("box david");
  });

  it("keeps Thai text as-is aside from case/whitespace (no diacritic stripping)", () => {
    expect(normalizeAliasText(" เดวิท ")).toBe("เดวิท");
  });
});

describe("validateAliasScope", () => {
  it("accepts GLOBAL with no customer/branch", () => {
    expect(validateAliasScope({ scope: "GLOBAL" })).toBeNull();
  });

  it("rejects GLOBAL with a customer set", () => {
    expect(validateAliasScope({ scope: "GLOBAL", customerId: "c1" })).not.toBeNull();
  });

  it("accepts CUSTOMER with customerId only", () => {
    expect(validateAliasScope({ scope: "CUSTOMER", customerId: "c1" })).toBeNull();
  });

  it("rejects CUSTOMER without customerId", () => {
    expect(validateAliasScope({ scope: "CUSTOMER" })).not.toBeNull();
  });

  it("rejects CUSTOMER with a branch also set", () => {
    expect(validateAliasScope({ scope: "CUSTOMER", customerId: "c1", branchId: "b1" })).not.toBeNull();
  });

  it("accepts BRANCH with both customerId and branchId", () => {
    expect(validateAliasScope({ scope: "BRANCH", customerId: "c1", branchId: "b1" })).toBeNull();
  });

  it("rejects BRANCH missing branchId", () => {
    expect(validateAliasScope({ scope: "BRANCH", customerId: "c1" })).not.toBeNull();
  });
});
