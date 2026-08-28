import { db } from "@/lib/db";

// Production Module (P1) — ค่าตั้งค่าที่ห้าม hardcode (ดู CLAUDE.md ส่วน "ค่าที่ห้าม
// Hardcode") เก็บผ่าน AppSetting เดิม (key-value) แบบเดียวกับ company-settings.ts
// ไม่สร้างตาราง ProductionSetting ใหม่

export type ProductionDepartment = { name: string; copies: number };

export type ProductionSettings = {
  sizes: string[];
  departments: ProductionDepartment[];
};

const DEFAULTS: ProductionSettings = {
  // ร่างตามเอกสารสเปก (docs/production-module/00-ส่งงาน.md) — แก้ได้จากหน้าตั้งค่า
  sizes: ["3", "3.5", "4", "5", "6", "สั่งตัด"],
  departments: [
    { name: "ผ้า", copies: 3 },
    { name: "โครงสร้าง", copies: 3 },
    { name: "Box/ฐานเตียง", copies: 2 },
  ],
};

const KEYS = {
  sizes: "production.sizes", // JSON string[]
  departments: "production.departments", // JSON ProductionDepartment[]
} as const;

export async function getProductionSettings(): Promise<ProductionSettings> {
  const rows = await db.appSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const sizesRaw = map[KEYS.sizes];
  const departmentsRaw = map[KEYS.departments];

  return {
    sizes: sizesRaw ? safeParseJson<string[]>(sizesRaw, DEFAULTS.sizes) : DEFAULTS.sizes,
    departments: departmentsRaw ? safeParseJson<ProductionDepartment[]>(departmentsRaw, DEFAULTS.departments) : DEFAULTS.departments,
  };
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
