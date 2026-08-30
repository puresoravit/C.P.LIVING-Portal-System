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

  // CP0 Cancellation boundary (doc 07 ข้อ 1 — Owner อนุมัติ 2026-08-30): ยกเลิกก่อนเริ่มผลิต
  // staff ทำได้ · กระทบใบที่เริ่มผลิตแล้วต้อง production.cancelStarted ซึ่งสงวน OWNER_ADMIN
  it("CP0: staff ยกเลิกออเดอร์/ใบสั่งผลิตที่ยังไม่เริ่มผลิตได้ แต่ cancelStarted เป็นของแอดมินเท่านั้น", () => {
    expect(can("BILLING_STAFF", "customerPo.cancel")).toBe(true);
    expect(can("BILLING_STAFF", "productionOrder.cancel")).toBe(true);
    expect(can("BILLING_STAFF", "production.cancelStarted")).toBe(false);
    expect(can("OWNER_ADMIN", "customerPo.cancel")).toBe(true);
    expect(can("OWNER_ADMIN", "productionOrder.cancel")).toBe(true);
    expect(can("OWNER_ADMIN", "production.cancelStarted")).toBe(true);
    expect(can("VIEWER", "customerPo.cancel")).toBe(false);
    expect(can("VIEWER", "productionOrder.cancel")).toBe(false);
    expect(can("VIEWER", "production.cancelStarted")).toBe(false);
  });

  // P2 CP1 — จัดการเที่ยวรถเป็นงานปฏิบัติการ (staff ทำได้เหมือน customerPo.*), VIEWER ไม่ได้
  it("CP1: loadingTrip.manage — ADMIN+STAFF ได้, VIEWER ไม่ได้", () => {
    expect(can("OWNER_ADMIN", "loadingTrip.manage")).toBe(true);
    expect(can("BILLING_STAFF", "loadingTrip.manage")).toBe(true);
    expect(can("VIEWER", "loadingTrip.manage")).toBe(false);
  });
});
