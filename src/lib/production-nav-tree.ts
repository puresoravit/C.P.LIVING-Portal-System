import type { NavNode } from "@/lib/nav-tree";

// Production & Delivery Module — Sidebar ของแอปนี้แยกจาก Billing (nav-tree.ts) โดย
// สิ้นเชิงตามที่ตกลง — reuse type NavNode + filterNav() เดิม (pure, ไม่ผูกกับแอปไหน
// เป็นพิเศษ) แค่ข้อมูล tree เป็นของตัวเอง
//
// IA นี้วางเผื่อภาพระยะยาวทั้งหมดตั้งแต่ S1 (ตามที่เจ้าของสั่ง) — หัวข้อที่ sprint ยังไม่
// ถึง (ออเดอร์ลูกค้า/ใบสั่งผลิต/สูตรผ้า/การขึ้นของ/ประวัติ) ชี้ไปหน้า stub ที่บอกตรงๆ ว่า
// ยังไม่เปิดใช้งาน — ไม่ใช่หน้าใช้งานจริง ห้ามเข้าใจผิดว่า build เสร็จแล้ว
// "ตระกูลสินค้า/ชื่อเรียก" ย้ายมาอยู่ใต้กลุ่มนี้ (ไม่ใช่เมนู operational หลัก) ตามที่สั่ง
export const PRODUCTION_NAV_TREE: NavNode[] = [
  { type: "link", href: "/production", label: "ภาพรวม", perm: null, icon: "dashboard" },
  { type: "link", href: "/production/orders", label: "ออเดอร์ลูกค้า", perm: null, icon: "documentPlus" },
  { type: "link", href: "/production/production-orders", label: "ใบสั่งผลิต", perm: null, icon: "list" },
  {
    type: "group",
    label: "ข้อมูลผ้าและโครงสร้าง",
    icon: "layers",
    items: [
      { type: "link", href: "/production/fabric", label: "สูตรผ้า / โครงสร้าง", perm: null, icon: "layers" },
      { type: "link", href: "/production/product-aliases", label: "ตระกูลสินค้า / ชื่อเรียก", perm: "productAlias.manage", icon: "tag" },
    ],
  },
  { type: "link", href: "/production/loading", label: "การขึ้นของและจัดส่ง", perm: null, icon: "delivery" },
  { type: "link", href: "/production/outstanding", label: "ของค้างส่ง", perm: null, icon: "list" },
  { type: "link", href: "/production/history", label: "ประวัติ", perm: null, icon: "history" },
  { type: "link", href: "/production/settings", label: "ตั้งค่า", perm: "productionSetting.manage", icon: "settings" },
  { type: "signout", label: "ออกจากระบบ", icon: "logout" },
];
