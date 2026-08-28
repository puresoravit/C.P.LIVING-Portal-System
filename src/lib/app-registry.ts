// ==========================================================================
// R6 Phase F — Central Application Registry
// Single Source of Truth ของ "รายชื่อ Application" ทั้งหมดบน Portal — ห้าม Hardcode
// รายชื่อแอพกระจายที่หน้า Portal/Access Management/Route Guard แยกกันเด็ดขาด ทุกจุด
// ต้อง Import จากไฟล์นี้ไฟล์เดียว
//
// อยู่ในโค้ด (ไม่ใช่ DB) โดยเจตนา: แอพหนึ่งตัว = โค้ด/Route ที่มีจริงใน Codebase เท่านั้น
// ผู้ใช้สร้างแอพเองไม่ได้ — ส่วน "ใครเข้าแอพไหนได้" เป็นข้อมูล → อยู่ใน DB
// (UserAppAccess, ดู app-access.ts)
// ==========================================================================

export type AppStatus = "enabled" | "coming_soon";

export type AppDefinition = {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  // Key ของ Icon (Render จริงใน Portal — SVG Inline ไม่พึ่ง Library ภายนอก)
  icon: "billing" | "calculator" | "box" | "factory" | "dots" | "shield";
  // Route ปลายทางเมื่อคลิก — null สำหรับแอพที่ยังไม่มีจริง (ห้ามชี้ Route ปลอม)
  route: string | null;
  status: AppStatus;
  // true = เห็น/เข้าได้เฉพาะ User ที่ isOwner=true เท่านั้น (ไม่เกี่ยวกับ UserAppAccess
  // และ Grant ให้ใครไม่ได้ — Access Management ต้องเป็นของ Owner คนเดียวตาม Requirement)
  ownerOnly?: true;
};

export const APP_REGISTRY: AppDefinition[] = [
  {
    id: "billing",
    name: "Account & Sales Billing",
    nameEn: "Account & Sales Billing",
    description: "จัดการลูกค้า ใบส่งของ ใบกำกับภาษี ใบวางบิล และรายงานยอดขาย",
    icon: "billing",
    // หน้าแรกของแอพ Billing (/dashboard แสดง Dashboard ยอดขายสำหรับ Role ที่มีสิทธิ์ดู
    // หรือหน้าทางลัดใช้งานประจำวันสำหรับ BILLING_STAFF — Logic เดิมของหน้านั้นเอง)
    route: "/dashboard",
    status: "enabled",
  },
  {
    id: "cost-calculation",
    name: "Cost Calculation",
    nameEn: "Cost Calculation",
    description: "คำนวณต้นทุนสินค้าและวิเคราะห์กำไร",
    icon: "calculator",
    route: null,
    status: "coming_soon",
  },
  {
    id: "inventory",
    name: "Inventory",
    nameEn: "Inventory",
    description: "จัดการสต็อก วัตถุดิบ และการติดตามสินค้าคงคลัง",
    icon: "box",
    route: null,
    status: "coming_soon",
  },
  {
    id: "production",
    name: "Production & Delivery",
    nameEn: "Production & Delivery",
    description: "ติดตามออเดอร์ตั้งแต่รับ P.O. จนของขึ้นรถครบ — P1: โครงกระดูก (คีย์มือล้วน)",
    icon: "factory",
    route: "/production",
    status: "enabled",
  },
  {
    id: "future",
    name: "More Applications",
    nameEn: "More Applications",
    description: "เครื่องมือและฟีเจอร์เพิ่มเติม เร็วๆ นี้",
    icon: "dots",
    route: null,
    status: "coming_soon",
  },
  {
    id: "access-management",
    name: "Access Management",
    nameEn: "Access Management",
    description: "จัดการสิทธิ์การเข้าถึงแอปพลิเคชันของผู้ใช้แต่ละคน (เฉพาะเจ้าของกิจการ)",
    icon: "shield",
    route: "/portal/access",
    status: "enabled",
    ownerOnly: true,
  },
];

export function getAppById(appId: string): AppDefinition | undefined {
  return APP_REGISTRY.find((a) => a.id === appId);
}

/** แอพที่ Grant/Revoke ผ่าน Access Management ได้ — ต้อง enabled จริงและไม่ใช่ ownerOnly
 * (แอพ coming_soon ยังไม่มี Route จริงให้เข้า — Grant ไปก็ไร้ความหมายและชวนสับสน) */
export function getGrantableApps(): AppDefinition[] {
  return APP_REGISTRY.filter((a) => a.status === "enabled" && !a.ownerOnly);
}
