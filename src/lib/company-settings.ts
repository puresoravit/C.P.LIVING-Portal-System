import { db } from "@/lib/db";

export type CompanySettings = {
  name: string;
  address: string;
  phone: string;
  taxId: string;
};

const DEFAULTS: CompanySettings = {
  name: "(ยังไม่ได้ตั้งค่าชื่อบริษัท)",
  address: "",
  phone: "",
  taxId: "",
};

const KEYS = {
  name: "company.name",
  address: "company.address",
  phone: "company.phone",
  taxId: "company.taxId",
} as const;

/** อ่านข้อมูลบริษัทผู้ออกเอกสาร จาก AppSetting table — ใช้เป็นหัวกระดาษทุกเอกสาร */
export async function getCompanySettings(): Promise<CompanySettings> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    name: map[KEYS.name] ?? DEFAULTS.name,
    address: map[KEYS.address] ?? DEFAULTS.address,
    phone: map[KEYS.phone] ?? DEFAULTS.phone,
    taxId: map[KEYS.taxId] ?? DEFAULTS.taxId,
  };
}

export { KEYS as COMPANY_SETTING_KEYS };
