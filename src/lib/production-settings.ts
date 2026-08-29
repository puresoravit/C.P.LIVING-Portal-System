import { db } from "@/lib/db";

// Production Module (P1) — ค่าตั้งค่าที่ห้าม hardcode (ดู CLAUDE.md ส่วน "ค่าที่ห้าม
// Hardcode") เก็บผ่าน AppSetting เดิม (key-value) แบบเดียวกับ company-settings.ts
// ไม่สร้างตาราง ProductionSetting ใหม่

export type ProductionDepartment = { name: string; copies: number };

export type ProductionSettings = {
  sizes: string[];
  departments: ProductionDepartment[];
  // S3 CP1 — แก้ CustomerPO.status ที่เคย hardcode "OPEN" ตรงๆ (ขัดกับ comment ในตัว
  // schema เอง "ค่าตั้งค่าใน AppSetting ไม่ hardcode") ตัวแรกในลิสต์ = สถานะเริ่มต้นตอนสร้าง
  customerPoStatuses: string[];
  // S3 CP1 — ProductionOrder.status ก็มี comment เดียวกัน "ค่าตั้งค่าใน AppSetting" — คนละ
  // ลิสต์จาก customerPoStatuses เพราะ lifecycle คนละความหมาย (ใบสั่งผลิต vs รับ P.O. ลูกค้า)
  productionOrderStatuses: string[];
  // S3 CP1 — Business validation ปัจจุบัน (ไม่ใช่ DB constraint ตามที่ยืนยัน) จำนวนกุ๊น
  // สูงสุด (ปัจจุบัน 4) และจำนวนผ้าสูงสุด "ต่อ placement" (ไม่ใช่ global) เพราะ placement
  // ส่วนใหญ่มีได้ 1 ผ้า ยกเว้นบาง placement (เช่นที่ Owner เรียก "ผ้าปีก") ที่มีได้ถึง 2 —
  // ยืนยันจากข้อมูลจริง (Cerina/Harry, 2026-08-28): WING กับ SIDE เป็นคนละ placement กัน
  // จริง (ไม่ใช่ชื่อเดียวกันคนละคำเรียก) และ SIDE มีได้ถึง 2 ผ้าจริง (Cerina SIDE #1/#2) —
  // WING ก็ยืนยันสูงสุด 2 จาก business rule ก่อนหน้า ("ผ้าปีก") placement อื่นที่ไม่อยู่ใน
  // map นี้ = ค่าเริ่มต้น 1 ผ้า (ดู getMaxFabricsForPlacement) ยังเป็น configurable ต่อไป
  // ไม่ hardcode DB constraint — Admin ปรับได้จากหน้าตั้งค่าถ้ากฎธุรกิจเปลี่ยน
  maxGussetCount: number;
  maxFabricsPerPlacement: Record<string, number>;
  // S4 UAT (2026-08-29) — แยก concept "จำนวนสำเนา" ออกจาก "ชื่อแผนก" ตามที่ Owner สั่ง:
  // ใบสั่งผลิตพิมพ์ printCopies ชุดเนื้อหาเหมือนกันหมด (label แค่ "สำเนา i/N") ไม่มี
  // department banner แล้ว — departments เดิมคงไว้เป็นข้อมูลแผนก (ยังไม่ถูกใช้พิมพ์)
  printCopies: number;
  // สถานะที่ตั้งเมื่อกด "ยืนยันเริ่มผลิตและพิมพ์" ครั้งแรก — เป็นค่าตั้งค่า ไม่ hardcode
  // ในโค้ด (ตามกฎ CLAUDE.md เรื่องสถานะเอกสาร)
  inProgressStatus: string;
};

const DEFAULTS: ProductionSettings = {
  // ร่างตามเอกสารสเปก (docs/production-module/00-ส่งงาน.md) — แก้ได้จากหน้าตั้งค่า
  sizes: ["3", "3.5", "4", "5", "6", "สั่งตัด"],
  departments: [
    { name: "ผ้า", copies: 3 },
    { name: "โครงสร้าง", copies: 3 },
    { name: "Box/ฐานเตียง", copies: 2 },
  ],
  customerPoStatuses: ["เปิดงาน"],
  productionOrderStatuses: ["รอผลิต"],
  maxGussetCount: 4,
  maxFabricsPerPlacement: { WING: 2, SIDE: 2 },
  printCopies: 8,
  inProgressStatus: "กำลังผลิต",
};

const KEYS = {
  sizes: "production.sizes", // JSON string[]
  departments: "production.departments", // JSON ProductionDepartment[]
  customerPoStatuses: "production.customerPoStatuses", // JSON string[] — ตัวแรก = default ตอนสร้าง
  productionOrderStatuses: "production.productionOrderStatuses", // JSON string[] — ตัวแรก = default ตอน Confirm/Issue
  maxGussetCount: "production.maxGussetCount", // plain number (as string)
  maxFabricsPerPlacement: "production.maxFabricsPerPlacement", // JSON Record<string, number>
  printCopies: "production.printCopies", // plain number (as string)
  inProgressStatus: "production.inProgressStatus", // plain string
} as const;

export async function getProductionSettings(): Promise<ProductionSettings> {
  const rows = await db.appSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const sizesRaw = map[KEYS.sizes];
  const departmentsRaw = map[KEYS.departments];
  const customerPoStatusesRaw = map[KEYS.customerPoStatuses];
  const productionOrderStatusesRaw = map[KEYS.productionOrderStatuses];
  const maxGussetCountRaw = map[KEYS.maxGussetCount];
  const maxFabricsPerPlacementRaw = map[KEYS.maxFabricsPerPlacement];
  const printCopiesRaw = map[KEYS.printCopies];
  const inProgressStatusRaw = map[KEYS.inProgressStatus];

  const maxGussetCountParsed = maxGussetCountRaw ? Number(maxGussetCountRaw) : NaN;
  const printCopiesParsed = printCopiesRaw ? Number(printCopiesRaw) : NaN;

  return {
    sizes: sizesRaw ? safeParseJson<string[]>(sizesRaw, DEFAULTS.sizes) : DEFAULTS.sizes,
    departments: departmentsRaw ? safeParseJson<ProductionDepartment[]>(departmentsRaw, DEFAULTS.departments) : DEFAULTS.departments,
    customerPoStatuses: customerPoStatusesRaw ? safeParseJson<string[]>(customerPoStatusesRaw, DEFAULTS.customerPoStatuses) : DEFAULTS.customerPoStatuses,
    productionOrderStatuses: productionOrderStatusesRaw ? safeParseJson<string[]>(productionOrderStatusesRaw, DEFAULTS.productionOrderStatuses) : DEFAULTS.productionOrderStatuses,
    maxGussetCount: Number.isFinite(maxGussetCountParsed) && maxGussetCountParsed > 0 ? maxGussetCountParsed : DEFAULTS.maxGussetCount,
    maxFabricsPerPlacement: maxFabricsPerPlacementRaw
      ? safeParseJson<Record<string, number>>(maxFabricsPerPlacementRaw, DEFAULTS.maxFabricsPerPlacement)
      : DEFAULTS.maxFabricsPerPlacement,
    printCopies: Number.isInteger(printCopiesParsed) && printCopiesParsed > 0 ? printCopiesParsed : DEFAULTS.printCopies,
    inProgressStatus: (inProgressStatusRaw ?? "").trim() || DEFAULTS.inProgressStatus,
  };
}

/** placement ที่ไม่ได้ระบุไว้ใน map = ค่าเริ่มต้น 1 ผ้า (ตรงกับทุกตัวอย่าง Production Spec ปัจจุบัน ยกเว้น placement ที่ระบุไว้ชัดเจน) */
export function getMaxFabricsForPlacement(settings: Pick<ProductionSettings, "maxFabricsPerPlacement">, placement: string): number {
  return settings.maxFabricsPerPlacement[placement] ?? 1;
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export { KEYS as PRODUCTION_SETTING_KEYS };

// ---------------------------------------------------------------
// Pure function แปลง <-> ข้อความในฟอร์ม (testable โดยไม่ต้องแตะ DB)
// ---------------------------------------------------------------

/** "3, 3.5, 4, 5, 6, สั่งตัด" -> ["3","3.5","4","5","6","สั่งตัด"] */
export function parseSizesText(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function formatSizesText(sizes: string[]): string {
  return sizes.join(", ");
}

/** หนึ่งบรรทัดต่อแผนก รูปแบบ "ชื่อแผนก, จำนวนชุด" เช่น "ผ้า, 3" */
export function parseDepartmentsText(raw: string): ProductionDepartment[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [namePart, copiesPart] = line.split(",");
      const name = (namePart ?? "").trim();
      const copiesNum = Number((copiesPart ?? "").trim());
      const copies = Number.isFinite(copiesNum) && copiesNum > 0 ? Math.floor(copiesNum) : 1;
      return { name, copies };
    })
    .filter((d) => d.name.length > 0);
}

export function formatDepartmentsText(departments: ProductionDepartment[]): string {
  return departments.map((d) => `${d.name}, ${d.copies}`).join("\n");
}

/** หนึ่งบรรทัดต่อ placement รูปแบบ "ชื่อ placement, จำนวนผ้าสูงสุด" เช่น "SIDE, 2" — placement ที่ไม่อยู่ในรายการ = ค่าเริ่มต้น 1 */
export function parseMaxFabricsPerPlacementText(raw: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)) {
    const [placementPart, countPart] = line.split(",");
    const placement = (placementPart ?? "").trim();
    const count = Number((countPart ?? "").trim());
    if (placement && Number.isFinite(count) && count > 0) result[placement] = Math.floor(count);
  }
  return result;
}

export function formatMaxFabricsPerPlacementText(map: Record<string, number>): string {
  return Object.entries(map)
    .map(([placement, count]) => `${placement}, ${count}`)
    .join("\n");
}
