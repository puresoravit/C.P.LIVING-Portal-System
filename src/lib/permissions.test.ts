import { describe, it, expect } from "vitest";
import { can } from "./permissions";

describe("Permission Matrix (ข้อ 3, 65)", () => {
  it("OWNER_ADMIN ทำได้ทุกอย่างรวมถึงจัดการ User", () => {
    expect(can("OWNER_ADMIN", "user.manage")).toBe(true);
    expect(can("OWNER_ADMIN", "price.edit")).toBe(true);
    expect(can("OWNER_ADMIN", "auditLog.view")).toBe(true);
  });

  it("BILLING_STAFF แก้ Price/Discount Master ไม่ได้ (ข้อ 3.2)", () => {
    expect(can("BILLING_STAFF", "price.edit")).toBe(false);
    expect(can("BILLING_STAFF", "discount.edit")).toBe(false);
    expect(can("BILLING_STAFF", "user.manage")).toBe(false);
  });

  it("BILLING_STAFF สร้าง Order และ Cancel เองได้โดยไม่ต้องขอ approve (clarification ข้อ 9)", () => {
    expect(can("BILLING_STAFF", "order.create")).toBe(true);
    expect(can("BILLING_STAFF", "order.cancel")).toBe(true);
    expect(can("BILLING_STAFF", "invoice.cancel")).toBe(true);
  });

  it("VIEWER แก้ไข transaction ใดๆ ไม่ได้ (ข้อ 3.3)", () => {
    expect(can("VIEWER", "order.create")).toBe(false);
    expect(can("VIEWER", "customer.edit")).toBe(false);
    expect(can("VIEWER", "report.view")).toBe(true);
    expect(can("VIEWER", "report.export")).toBe(true);
  });
});
