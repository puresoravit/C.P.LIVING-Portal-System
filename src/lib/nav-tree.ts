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
          // Owner UAT Fix Batch 1 — ข้อ 4: เปิดใช้งานจริงแล้ว (เดิม disabled: true, href: "#")
          { type: "link", href: "/tax-invoices/from-invoice", label: "ดึงยอดจากใบส่งของชั่วคราว", perm: "taxInvoice.create" },
        ],
      },
      { type: "link", href: "/billing-notes/new", label: "ใบวางบิล", perm: "billingNote.create" },
      { type: "link", href: "/repair-notes/new", label: "ใบส่งคืนสินค้าฝากซ่อม", perm: "repairNote.create" },
      // Phase C — "แก้ไข / Edit Form" หมายถึง Document Template Editor (Logo/Font/
      // Spacing/Header-Footer ต่อประเภทเอกสาร) ไม่ใช่การแก้ไขข้อมูล Transaction — ทุก
      // ลิงก์ชี้ไปหน้า /settings/print-template เดิม (Deep-link ด้วย Fragment ไปยัง
      // ประเภทเอกสารที่เลือก) ใช้สิทธิ์ user.manage ให้ตรงกับหน้าปลายทางจริง (เดิมใช้
      // สิทธิ์เอกสารแต่ละใบซึ่งพากลุ่มไปเจอ redirect ถ้าไม่มี user.manage)
      {
        type: "group",
        label: "แก้ไข / Edit Form",
        items: [
          { type: "link", href: "/settings/print-template#QUOTATION", label: "ใบเสนอราคา / Quotation", perm: "user.manage" },
          { type: "link", href: "/settings/print-template#INVOICE", label: "ใบส่งของชั่วคราว", perm: "user.manage" },
          { type: "link", href: "/settings/print-template#TAX_INVOICE", label: "ใบกำกับภาษี", perm: "user.manage" },
          { type: "link", href: "/settings/print-template#BILLING_NOTE", label: "ใบวางบิล", perm: "user.manage" },
          { type: "link", href: "/settings/print-template#REPAIR_NOTE", label: "ใบส่งคืนสินค้าฝากซ่อม", perm: "user.manage" },
        ],
      },
    ],
  },
  // Owner UAT — จัดกลุ่ม "เอกสาร / Document" ใหม่เป็น Group มี 4 เมนูย่อยตาม Layout ที่
  // Owner ระบุตรงๆ: "เอกสารทั้งหมด" (Document Center /orders เดิม) → "เอกสารใบเสนอราคา"
  // (/quotations) → "เอกสารใบส่งของชั่วคราว" (/invoices) → "เอกสารใบกำกับภาษี"
  // (/tax-invoices) — ทั้ง 3 หน้าหลังมี Status Tab ของตัวเองอยู่แล้วจริง (ไม่ใช่หน้าใหม่
  // ไม่มี Logic ใหม่ แค่เพิ่ม Nav Link ให้เข้าถึงได้จาก Sidebar) — Quotation/Tax Invoice
  // "ไม่มี" Tab ยังไม่พิมพ์/พิมพ์บางส่วน/พิมพ์แล้ว แบบ Order เพราะไม่มี PRINTED Checkpoint
  // ในตัวเองเลย (ดู QuotationStatus/TaxInvoiceStatus enum — มีแค่ DRAFT/CONFIRMED/
  // CANCELLED ตามจริง ไม่ใช่ Concept เดียวกับ Order ที่ Derived จาก Invoice ลูกหลายใบ) —
  // ห้ามเดา Status ที่ไม่มีจริงเพิ่มให้ 2 หน้านี้ (กฎเดิมของระบบ)
  {
    type: "group",
    label: "เอกสาร / Document",
    items: [
      { type: "link", href: "/orders", label: "เอกสารทั้งหมด", perm: "order.create" },
      { type: "link", href: "/quotations", label: "เอกสารใบเสนอราคา", perm: "quotation.view" },
      { type: "link", href: "/invoices", label: "เอกสารใบส่งของชั่วคราว", perm: "invoice.create" },
      { type: "link", href: "/tax-invoices", label: "เอกสารใบกำกับภาษี", perm: "taxInvoice.create" },
    ],
  },
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
      { type: "link", href: "/product-categories", label: "ประเภทสินค้า", perm: "product.view" },
      { type: "link", href: "/product-types", label: "กลุ่มส่วนลด", perm: "productType.view" },
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
