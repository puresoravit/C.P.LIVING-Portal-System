import { describe, it, expect } from "vitest";
import { resolveAccessHead, isAllowedByAccessList, companyAccessWhere } from "./product-company-access";

// R8 — Product Assignment ตามบริษัทลูกค้า: Semantics หลักที่ห้ามพังคือ
// (1) ไม่มีแถวสิทธิ์เลย = สินค้าส่วนกลาง ทุกบริษัทใช้ได้ (ข้อมูล Production เดิมทั้งหมด
//     เข้าเคสนี้ — Zero-behavior-change ตอน Migrate)
// (2) Variant ใช้สิทธิ์ของ Family Head เสมอ ไม่มีของตัวเอง

describe("resolveAccessHead", () => {
  it("standalone product (ไม่มี parent/model) เป็น Head ของตัวเอง", () => {
    expect(resolveAccessHead({ id: "p1", parentProductId: null, modelId: null })).toEqual({
      kind: "product",
      id: "p1",
    });
  });

  it("size variant ของ Product Anchor ใช้ Head = Anchor (parentProductId)", () => {
    expect(resolveAccessHead({ id: "p2", parentProductId: "anchor1", modelId: null })).toEqual({
      kind: "product",
      id: "anchor1",
    });
  });

  it("variant ของ ProductModel ใช้ Head = Model", () => {
    expect(resolveAccessHead({ id: "p3", parentProductId: null, modelId: "m1" })).toEqual({
      kind: "model",
      id: "m1",
    });
  });

  it("parentProductId ชนะ modelId เมื่อมีทั้งคู่ (Anchor Family เป็นแนวทางปัจจุบัน)", () => {
    expect(resolveAccessHead({ id: "p4", parentProductId: "anchor2", modelId: "m9" })).toEqual({
      kind: "product",
      id: "anchor2",
    });
  });
});

describe("isAllowedByAccessList", () => {
  it("ไม่มีแถวเลย = สินค้าส่วนกลาง ทุกบริษัทใช้ได้", () => {
    expect(isAllowedByAccessList([], "anyCustomer")).toBe(true);
  });

  it("มีแถวและบริษัทอยู่ในรายชื่อ = ใช้ได้", () => {
    expect(isAllowedByAccessList(["c1", "c2"], "c2")).toBe(true);
  });

  it("มีแถวแต่บริษัทไม่อยู่ในรายชื่อ = ใช้ไม่ได้", () => {
    expect(isAllowedByAccessList(["c1", "c2"], "c3")).toBe(false);
  });
});

describe("companyAccessWhere", () => {
  it("สร้าง Fragment แบบ OR: ไม่มีแถวเลย หรือ มีแถวของบริษัทนี้", () => {
    expect(companyAccessWhere("c1")).toEqual({
      OR: [{ companyAccess: { none: {} } }, { companyAccess: { some: { customerId: "c1" } } }],
    });
  });
});
