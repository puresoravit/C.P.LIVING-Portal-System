import { describe, it, expect } from "vitest";
import { resolveAccessHead, isAllowedByAccessList, isVisibleToCompany, companyAccessWhere } from "./product-company-access";

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

// R9 — Catalog เป็นชั้นตัดสินหลัก / Legacy Allowlist เป็น Fallback ของสินค้าส่วนกลาง
describe("isVisibleToCompany (R9 — Catalog + Legacy)", () => {
  it("Head อยู่ใน Catalog: เห็นเฉพาะบริษัทสมาชิกกลุ่ม", () => {
    expect(isVisibleToCompany({ catalogCompanyIds: ["a", "b"], accessCustomerIds: [], customerId: "a" })).toBe(true);
    expect(isVisibleToCompany({ catalogCompanyIds: ["a", "b"], accessCustomerIds: [], customerId: "c" })).toBe(false);
  });

  it("Head ใน Catalog: Legacy Allowlist ไม่มีผลอีกต่อไป (สมาชิกกลุ่มตัดสินอย่างเดียว)", () => {
    // แม้ Allowlist ระบุ c ไว้ แต่ c ไม่ใช่สมาชิกกลุ่ม = ไม่เห็น
    expect(isVisibleToCompany({ catalogCompanyIds: ["a"], accessCustomerIds: ["c"], customerId: "c" })).toBe(false);
  });

  it("Head ไม่มี Catalog (สินค้าส่วนกลาง): กฎ Legacy เดิม — ไม่มีแถวเลย = ทุกบริษัทเห็น", () => {
    expect(isVisibleToCompany({ catalogCompanyIds: null, accessCustomerIds: [], customerId: "ใครก็ได้" })).toBe(true);
  });

  it("Head ไม่มี Catalog: มีแถว Allowlist = เฉพาะบริษัทในแถว (Compatibility R8)", () => {
    expect(isVisibleToCompany({ catalogCompanyIds: null, accessCustomerIds: ["a"], customerId: "a" })).toBe(true);
    expect(isVisibleToCompany({ catalogCompanyIds: null, accessCustomerIds: ["a"], customerId: "b" })).toBe(false);
  });

  it("Catalog ว่าง (ยังไม่มีสมาชิก — เช่นถอดบริษัทออกหมด): ไม่มีใครเห็นจนกว่าจะเพิ่มสมาชิก", () => {
    expect(isVisibleToCompany({ catalogCompanyIds: [], accessCustomerIds: [], customerId: "a" })).toBe(false);
  });
});

describe("companyAccessWhere (R10)", () => {
  it("Fragment ตัดสินตามลำดับ: Private → สมาชิก Catalog (ไม่รวมสินค้าเสนอราคา) → Legacy", () => {
    expect(companyAccessWhere("c1")).toEqual({
      OR: [
        { ownerCustomerId: "c1" },
        {
          AND: [
            { ownerCustomerId: null },
            { catalog: { isQuotationCatalog: false, companies: { some: { customerId: "c1" } } } },
          ],
        },
        {
          AND: [
            { ownerCustomerId: null },
            { catalogId: null },
            { OR: [{ companyAccess: { none: {} } }, { companyAccess: { some: { customerId: "c1" } } }] },
          ],
        },
      ],
    });
  });
});

// R10 — Private / สินค้าเสนอราคา
describe("isVisibleToCompany (R10 — Private + Quotation Catalog)", () => {
  it("Private ของบริษัทนี้ = เห็นเสมอ (ไม่สนกลุ่ม/Allowlist)", () => {
    expect(
      isVisibleToCompany({ ownerCustomerId: "a", catalogCompanyIds: null, accessCustomerIds: [], customerId: "a" })
    ).toBe(true);
  });

  it("Private ของบริษัทอื่น = ไม่เห็น แม้อยู่กลุ่มเดียวกัน", () => {
    expect(
      isVisibleToCompany({ ownerCustomerId: "b", catalogCompanyIds: ["a", "b"], accessCustomerIds: [], customerId: "a" })
    ).toBe(false);
  });

  it("Head ใน Catalog สินค้าเสนอราคา = Customer Master ไม่เห็นเสมอ", () => {
    expect(
      isVisibleToCompany({
        ownerCustomerId: null,
        catalogCompanyIds: [],
        isQuotationCatalog: true,
        accessCustomerIds: [],
        customerId: "a",
      })
    ).toBe(false);
  });

  it("ตัวอย่างกลุ่มปีนัง: สมาชิกเห็น Shared ของกลุ่ม + Private ของตัวเองเท่านั้น", () => {
    const group = ["cm", "sc", "korat"];
    // Shared A/B/C ของกลุ่ม — ทุกสมาชิกเห็น
    for (const member of group) {
      expect(isVisibleToCompany({ ownerCustomerId: null, catalogCompanyIds: group, accessCustomerIds: [], customerId: member })).toBe(true);
    }
    // Private CM-01 ของเชียงใหม่ — สมาชิกอื่นไม่เห็น
    expect(isVisibleToCompany({ ownerCustomerId: "cm", catalogCompanyIds: null, accessCustomerIds: [], customerId: "cm" })).toBe(true);
    expect(isVisibleToCompany({ ownerCustomerId: "cm", catalogCompanyIds: null, accessCustomerIds: [], customerId: "sc" })).toBe(false);
    expect(isVisibleToCompany({ ownerCustomerId: "cm", catalogCompanyIds: null, accessCustomerIds: [], customerId: "korat" })).toBe(false);
  });
});
