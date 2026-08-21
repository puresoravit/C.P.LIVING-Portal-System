import type { Permission } from "@/lib/permissions";

// Phase Nav-1 — โครงสร้าง Sidebar ใหม่แบบ Group/Submenu ตาม Requirement ที่อนุมัติ
// แยกเป็นไฟล์ pure data + pure filter function ไม่แตะ DB เพื่อ unit test ได้ตรงๆ
// (การกรอง Permission ใช้ can() ตัวเดียวกับที่ทุกหน้าใช้อยู่แล้ว ไม่มี Logic ใหม่)
export type NavLink = {
  type: "link";
  href: string;
  label: string;
  perm: Permission | null;
  // เมนูย่อยที่ยังไม่มี Route/Feature จริงตาม Implementation Plan — แสดงไว้ให้เห็น
  // โครงสร้างเมนูที่อนุมัติแล้ว แต่กดไม่ได้ (ห้ามสร้าง Business Logic ปลอมเพื่อให้ใช้ได้)
  disabled?: true;
};
export type NavSignOut = { type: "signout"; label: string };
export type NavGroup = { type: "group"; label: string; items: NavNode[] };
export type NavNode = NavLink | NavGroup | NavSignOut;

export const NAV_TREE: NavNode[] = [
  { type: "link", href: "/", label: "ข้อมูลทั่วไป / Dashboard", perm: "report.view" },
  {
    type: "group",
    label: "สร้างเอกสาร / Create Document",
    items: [
      { type: "link", href: "/quotations/new", label: "ใบเสนอราคา / Quotation", perm: "quotation.create" },
      { type: "link", href: "/orders/new", label: "ใบส่งของชั่วคราว", perm: "order.create" },
      {
        type: "group",
        label: "ใบกำกับภาษี",
        items: [
          { type: "link", href: "/tax-invoices/new", label: "สร้างใบกำกับภาษี / Create Tax Invoice", perm: "taxInvoice.create" },
          { type: "link", href: "#", label: "ดึงยอดจากใบส่งของชั่วคราว", perm: "taxInvoice.create", disabled: true },
        ],
      },
      { type: "link", href: "/billing-notes/new", label: "ใบวางบิล", perm: "billingNote.create" },
      { type: "link", href: "/repair-notes/new", label: "ใบส่งคืนสินค้าฝากซ่อม", perm: "repairNote.create" },
      {
        type: "group",
        label: "แก้ไข / Edit Form",
        items: [
          { type: "link", href: "/quotations", label: "ใบเสนอราคา / Quotation", perm: "quotation.view" },
          { type: "link", href: "/orders", label: "ใบส่งของชั่วคราว", perm: "order.create" },
          { type: "link", href: "#", label: "ใบกำกับภาษี", perm: "taxInvoice.create", disabled: true },
          { type: "link", href: "#", label: "ใบวางบิล", perm: "billingNote.create", disabled: true },
          { type: "link", href: "#", label: "ใบส่งคืนสินค้าฝากซ่อม", perm: "repairNote.create", disabled: true },
        ],
      },
    ],
  },
  { type: "link", href: "/orders", label: "เอกสาร / Document", perm: "order.create" },
  { type: "link", href: "/reports", label: "รายงานยอดขาย / Sales Report", perm: "report.view" },
  {
    type: "group",
    label: "ลูกค้า / Customer",
    items: [
      { type: "link", href: "/customers", label: "ลูกค้า", perm: "customer.view" },
      { type: "link", href: "/branches", label: "สาขา / Branch", perm: "branch.view" },
    ],
  },
  {
    type: "group",
    label: "สินค้า / Product",
    items: [
      { type: "link", href: "/products", label: "รายการสินค้า", perm: "product.view" },
      { type: "link", href: "/product-types", label: "ประเภทสินค้า", perm: "productType.view" },
      { type: "link", href: "/product-models", label: "รุ่นสินค้า", perm: "product.view" },
      { type: "link", href: "/prices", label: "ราคาเฉพาะลูกค้า / สาขา", perm: "price.view" },
      { type: "link", href: "/discounts", label: "ส่วนลดสินค้า", perm: "discount.view" },
    ],
  },
  { type: "link", href: "/import", label: "นำเข้าข้อมูล / Excel", perm: "user.manage" },
  { type: "link", href: "/audit-log", label: "Audit Log", perm: "auditLog.view" },
  { type: "link", href: "/settings/vat", label: "ตั้งค่า VAT", perm: "user.manage" },
  {
    type: "group",
    label: "ตั้งค่า / Settings",
    items: [
      { type: "link", href: "/settings/company", label: "ข้อมูลบริษัท", perm: "user.manage" },
      { type: "link", href: "/settings/print-template", label: "รูปแบบเอกสาร / Print Template", perm: "user.manage" },
      { type: "link", href: "/settings/permissions", label: "สิทธิการใช้งาน", perm: "user.manage" },
      { type: "link", href: "/settings/backup", label: "สำรอง/กู้คืนข้อมูล", perm: "user.manage" },
      { type: "link", href: "/settings/logs", label: "System Logs", perm: "user.manage" },
      { type: "signout", label: "ออกจากระบบ" },
    ],
  },
];

/**
 * กรอง Nav Tree ตาม Permission ของ Role — ใช้ can() ตัวเดียวกับทุกหน้า ไม่มี Logic
 * ใหม่ Group ที่ไม่เหลือ item ที่มองเห็นได้เลย (ทุกลูกถูกกรองออกหมด) จะหายไปทั้ง Group
 * signout ไม่เช็ค Permission (ทุก Role ที่ Login แล้วออกจากระบบได้เสมอ เหมือนเดิม)
 */
export function filterNav(nodes: NavNode[], canFn: (perm: Permission) => boolean): NavNode[] {
  const result: NavNode[] = [];
  for (const node of nodes) {
    if (node.type === "signout") {
      result.push(node);
    } else if (node.type === "link") {
      if (!node.perm || canFn(node.perm)) result.push(node);
    } else {
      const filteredItems = filterNav(node.items, canFn);
      if (filteredItems.length > 0) result.push({ ...node, items: filteredItems });
    }
  }
  return result;
}
