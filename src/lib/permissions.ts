import { Role } from "@prisma/client";

// ---------------------------------------------------------------
// Centralized Permission Matrix (ข้อ 3.1-3.3)
// ห้ามกระจาย if (role === "...") ไปทั่วโค้ด — รวมไว้จุดเดียวเพื่อ
// แก้ Role ในอนาคตได้ที่เดียว (ตรงกับหลัก Maintainability ข้อ 79)
// ---------------------------------------------------------------

export type Permission =
  | "customer.view" | "customer.edit"
  | "branch.view" | "branch.edit"
  | "product.view" | "product.edit"
  | "productType.view" | "productType.edit"
  | "price.view" | "price.edit"
  | "discount.view" | "discount.edit"
  | "order.create" | "order.editDraft" | "order.confirm" | "order.cancel"
  | "quotation.view" | "quotation.create" | "quotation.edit" | "quotation.confirm" | "quotation.cancel" | "quotation.print"
  | "invoice.create" | "invoice.cancel" | "invoice.print"
  | "taxInvoice.create" | "taxInvoice.cancel" | "taxInvoice.print"
  | "billingNote.create" | "billingNote.cancel" | "billingNote.print"
  | "repairNote.create" | "repairNote.cancel" | "repairNote.print"
  | "report.view" | "report.export"
  | "user.manage"
  | "auditLog.view";

const MATRIX: Record<Role, Permission[]> = {
  OWNER_ADMIN: [
    "customer.view", "customer.edit",
    "branch.view", "branch.edit",
    "product.view", "product.edit",
    "productType.view", "productType.edit",
    "price.view", "price.edit",
    "discount.view", "discount.edit",
    "order.create", "order.editDraft", "order.confirm", "order.cancel",
    "quotation.view", "quotation.create", "quotation.edit", "quotation.confirm", "quotation.cancel", "quotation.print",
    "invoice.create", "invoice.cancel", "invoice.print",
    "taxInvoice.create", "taxInvoice.cancel", "taxInvoice.print",
    "billingNote.create", "billingNote.cancel", "billingNote.print",
    "repairNote.create", "repairNote.cancel", "repairNote.print",
    "report.view", "report.export",
    "user.manage",
    "auditLog.view",
  ],
  BILLING_STAFF: [
    "customer.view",
    "branch.view",
    "product.view",
    "productType.view",
    "order.create", "order.editDraft", "order.confirm", "order.cancel", // ข้อ 9 clarification: ยกเลิกเองได้ไม่ต้องขอ
    "quotation.view", "quotation.create", "quotation.edit", "quotation.confirm", "quotation.cancel", "quotation.print",
    "invoice.create", "invoice.cancel", "invoice.print",
    "taxInvoice.create", "taxInvoice.cancel", "taxInvoice.print",
    "billingNote.create", "billingNote.cancel", "billingNote.print",
    "repairNote.create", "repairNote.cancel", "repairNote.print",
  ],
  VIEWER: [
    "customer.view", "branch.view", "product.view", "productType.view",
    "report.view", "report.export",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}
