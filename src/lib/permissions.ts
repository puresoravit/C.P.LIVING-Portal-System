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
  | "auditLog.view"
  // ---------------------------------------------------------------
  // Production Module (P1) — ตั้งชื่อ "customerPo"/"productionOrder" แยกจาก "order.*" เดิม
  // (order.* เป็นของ Billing คนละเอกสาร คนละความหมาย)
  // ---------------------------------------------------------------
  | "customerPo.create" | "customerPo.editDraft" | "customerPo.confirm" | "customerPo.cancel"
  | "productionOrder.create" | "productionOrder.confirm" | "productionOrder.revise" | "productionOrder.print"
  | "productAlias.manage"
  | "productionSetting.manage"
  | "productionMasterSpec.manage";

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
    // Production Module (P1) — Admin ทำได้ทุกอย่างรวมถึง Master/Settings
    "customerPo.create", "customerPo.editDraft", "customerPo.confirm", "customerPo.cancel",
    "productionOrder.create", "productionOrder.confirm", "productionOrder.revise", "productionOrder.print",
    "productAlias.manage",
    "productionSetting.manage",
    // Master Spec (สูตรผ้า/โครงสร้างต้นแบบ) — master data นำเข้า/แก้ได้เฉพาะ Admin เช่นเดียว
    // กับ productAlias.manage/productionSetting.manage (BILLING_STAFF ดูอย่างเดียว ไม่มีสิทธิ์นี้)
    "productionMasterSpec.manage",
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
    // Production Module (P1) — งาน flow เอกสารทำได้เหมือน order.* เดิม แต่ Master/
    // Settings (productAlias.manage, productionSetting.manage) สงวนไว้ที่ OWNER_ADMIN
    // เท่านั้น ตาม convention เดิม (เทียบ productType.edit ที่ staff ก็ไม่มีเช่นกัน) —
    // การสร้าง Product/SKU ใหม่จาก UNRESOLVED line ใช้ "product.edit" เดิม (staff ไม่มี
    // สิทธิ์นี้อยู่แล้ว ตรงกับ decision ที่ยืนยันว่าต้องหัวหน้า/Admin เท่านั้น)
    "customerPo.create", "customerPo.editDraft", "customerPo.confirm", "customerPo.cancel",
    "productionOrder.create", "productionOrder.confirm", "productionOrder.revise", "productionOrder.print",
  ],
  VIEWER: [
    "customer.view", "branch.view", "product.view", "productType.view",
    "report.view", "report.export",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}
