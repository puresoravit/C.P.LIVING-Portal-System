import { describe, it, expect } from "vitest";
import { checkOrderEditable } from "./order-edit-guard";

describe("checkOrderEditable", () => {
  it("not-applicable ถ้า Order ไม่ใช่ CONFIRMED", () => {
    const result = checkOrderEditable({
      orderStatus: "DRAFT",
      invoiceStatuses: [],
      invoicesWithBillingNote: 0,
      hasActiveTaxInvoiceReference: false,
    });
    expect(result).toEqual({ kind: "not-applicable" });
  });

  // เคส 1: Order แก้ครั้งแรก
  it("editable — Order แก้ครั้งแรก (Invoice ทุกใบ Active ยังไม่เคยแก้ไข)", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: ["CONFIRMED", "CONFIRMED"],
      invoicesWithBillingNote: 0,
      hasActiveTaxInvoiceReference: false,
    });
    expect(result).toEqual({ kind: "editable", requiresPrintedAck: false, downstreamReferences: [] });
  });

  // เคส 2: Order เดิมแก้ครั้งที่สอง — มี Invoice เก่า Cancelled ค้างจากการแก้ครั้งแรก
  // ต้องยัง editable ได้ (นี่คือ Bug เดิมที่แก้ในรอบนี้)
  it("editable — Order แก้ครั้งที่สอง แม้มี Invoice เก่าที่ Cancelled จากการแก้ครั้งแรกค้างอยู่", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: ["CANCELLED", "CONFIRMED", "CONFIRMED"],
      invoicesWithBillingNote: 0,
      hasActiveTaxInvoiceReference: false,
    });
    expect(result).toEqual({ kind: "editable", requiresPrintedAck: false, downstreamReferences: [] });
  });

  // เคส 3: มี Cancelled Invoice เก่าหลายใบ + Active Invoice ปัจจุบัน 1 ใบ — ยัง editable
  it("editable — มี Cancelled Invoice เก่าหลายใบ ไม่ว่าจะกี่ใบก็ไม่ block", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: ["CANCELLED", "CANCELLED", "CANCELLED", "CONFIRMED"],
      invoicesWithBillingNote: 0,
      hasActiveTaxInvoiceReference: false,
    });
    expect(result).toEqual({ kind: "editable", requiresPrintedAck: false, downstreamReferences: [] });
  });

  // เคส 4/5 (Owner UAT 2026-08-29) — เดิม "locked" ห้ามแก้เลย ตอนนี้ยัง editable ได้เสมอ
  // แค่รายงาน downstreamReferences ให้ UI แจ้งเตือนว่าใบกำกับภาษี/ใบวางบิลที่ออกไปแล้ว
  // จะไม่ถูกแตะ (Owner ยืนยันไม่ต้องอัปเดตตาม)
  it("editable — มี Active Invoice ที่อยู่ใน Billing Note แล้ว รายงาน downstreamReferences ['billing-note']", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: ["CANCELLED", "CONFIRMED"],
      invoicesWithBillingNote: 1,
      hasActiveTaxInvoiceReference: false,
    });
    expect(result).toEqual({ kind: "editable", requiresPrintedAck: false, downstreamReferences: ["billing-note"] });
  });

  it("editable — มี Active Invoice ที่มี Tax Invoice อ้างอิง รายงาน downstreamReferences ['tax-invoice']", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: ["CANCELLED", "CONFIRMED"],
      invoicesWithBillingNote: 0,
      hasActiveTaxInvoiceReference: true,
    });
    expect(result).toEqual({ kind: "editable", requiresPrintedAck: false, downstreamReferences: ["tax-invoice"] });
  });

  it("รายงาน downstreamReferences ทั้งสองอย่างพร้อมกันถ้าเข้าเงื่อนไขทั้งคู่", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: ["CONFIRMED", "CONFIRMED"],
      invoicesWithBillingNote: 1,
      hasActiveTaxInvoiceReference: true,
    });
    expect(result).toEqual({ kind: "editable", requiresPrintedAck: false, downstreamReferences: ["billing-note", "tax-invoice"] });
  });

  // เคส 6: Active Invoice เป็น PRINTED แต่ไม่มี downstream — editable + ต้อง warning
  it("editable + requiresPrintedAck ถ้ามีใบ Active สถานะ PRINTED แต่ไม่มีการอ้างอิงต่อ", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: ["CONFIRMED", "PRINTED"],
      invoicesWithBillingNote: 0,
      hasActiveTaxInvoiceReference: false,
    });
    expect(result).toEqual({ kind: "editable", requiresPrintedAck: true, downstreamReferences: [] });
  });

  it("editable + requiresPrintedAck + downstreamReferences พร้อมกันได้ (PRINTED และมี Tax Invoice อ้างอิง)", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: ["PRINTED"],
      invoicesWithBillingNote: 0,
      hasActiveTaxInvoiceReference: true,
    });
    expect(result).toEqual({ kind: "editable", requiresPrintedAck: true, downstreamReferences: ["tax-invoice"] });
  });

  // เคส 7: ไม่มี Active Invoice เหลือเลย — Abnormal State ต้อง Refuse ไม่เดา
  it("no-active-invoices ถ้า Invoice ทุกใบถูกยกเลิกไปหมดแล้ว (Abnormal State)", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: ["CANCELLED", "CANCELLED"],
      invoicesWithBillingNote: 0,
      hasActiveTaxInvoiceReference: false,
    });
    expect(result).toEqual({ kind: "no-active-invoices" });
  });

  it("no-active-invoices ถ้า Order Confirmed แต่ไม่เคยมี Invoice เลย (Abnormal State)", () => {
    const result = checkOrderEditable({
      orderStatus: "CONFIRMED",
      invoiceStatuses: [],
      invoicesWithBillingNote: 0,
      hasActiveTaxInvoiceReference: false,
    });
    expect(result).toEqual({ kind: "no-active-invoices" });
  });
});
