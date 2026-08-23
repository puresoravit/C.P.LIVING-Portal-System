"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";
import {
  TEMPLATE_SETTING_KEYS,
  globalTemplateSettingsSchema,
  documentTemplateOverrideSchema,
  validateLogoDataUri,
  resolveBlockOrder,
  resolveHeaderLayout,
  DEFAULT_HEADER_LAYOUT,
  type DocumentTypeKey,
} from "@/lib/print-template-settings";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

function checkboxValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "1";
}

// R6 Phase E — Visual Document Designer ส่ง blockOrder มาเป็น Hidden Field JSON เดียว
// (Array ของ 3 Key) — Parse แบบปลอดภัยเสมอ (Fallback ไป Default ถ้าไม่มี/Parse ไม่ได้)
// ก่อนส่งต่อให้ Zod ตรวจ Permutation อีกชั้นหนึ่ง (Defense-in-depth เหมือน Field อื่น)
function parseBlockOrderField(formData: FormData) {
  const raw = formData.get("blockOrder");
  if (!raw) return resolveBlockOrder(null);
  try {
    return resolveBlockOrder(JSON.parse(String(raw)));
  } catch {
    return resolveBlockOrder(null);
  }
}

// R6 Phase E.1 — headerLayout เดียวกัน: ไม่มี Field นี้เลย (Hidden Input ไม่ถูกส่งมา
// เพราะยังอยู่โหมด Classic) = null ตรงๆ (โหมด Classic เป็นค่าที่ถูกต้อง ไม่ใช่ Fallback
// จาก Error) — Parse ไม่ได้ค่อย Fallback ไป Default Custom Layout (ดู resolveHeaderLayout)
function parseHeaderLayoutField(formData: FormData) {
  const raw = formData.get("headerLayout");
  if (!raw) return null;
  try {
    return resolveHeaderLayout(JSON.parse(String(raw)));
  } catch {
    return DEFAULT_HEADER_LAYOUT;
  }
}

// R5 — บันทึก Global Template Settings ทั้งชุด (รวม logoSize) ยกเว้น Logo เอง (แยก
// Action ต่างหาก กันการส่ง Base64 ก้อนใหญ่ซ้ำทุกครั้งที่แก้แค่ Text/Checkbox)
export async function updateGlobalTemplateSettings(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "user.manage")) throw new Error("FORBIDDEN");

  const raw = globalTemplateSettingsSchema.safeParse({
    showAddress: checkboxValue(formData, "showAddress"),
    showPhone: checkboxValue(formData, "showPhone"),
    showTaxId: checkboxValue(formData, "showTaxId"),
    footerNote: String(formData.get("footerNote") || ""),
    fontFamily: String(formData.get("fontFamily") || ""),
    bodyFontSize: String(formData.get("bodyFontSize") || ""),
    headingFontSize: String(formData.get("headingFontSize") || ""),
    spacingDensity: String(formData.get("spacingDensity") || ""),
    contentPadding: String(formData.get("contentPadding") || ""),
    logoSize: String(formData.get("logoSize") || ""),
    blockOrder: parseBlockOrderField(formData),
    headerLayout: parseHeaderLayoutField(formData),
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }

  const value = JSON.stringify(raw.data);
  await db.appSetting.upsert({
    where: { key: TEMPLATE_SETTING_KEYS.global },
    create: { key: TEMPLATE_SETTING_KEYS.global, value },
    update: { value },
  });

  await db.auditLog.create({
    data: { userId: user.id, action: "UPDATE", module: "AppSetting", recordId: "template.global", newValue: raw.data },
  });

  revalidatePath("/settings/print-template");
  return { success: true };
}

// R6 Phase E — Visual Designer "Reset Template to Default": ลบ Row Global ทิ้งทั้ง
// แถว (คนละ Action กับ Logo ที่มีปุ่ม "ลบโลโก้" แยกต่างหากอยู่แล้ว) — parseJsonSafe ใน
// getGlobalTemplateSettingsRaw/getPrintTemplateSettings Fallback ไป
// DEFAULT_GLOBAL_TEMPLATE_SETTINGS เองเมื่อไม่มีแถวนี้ จึงไม่ต้อง Insert ค่า Default
// กลับเข้าไปตรงๆ — Pattern เดียวกับการลบ Override ทุกประการ
export async function resetGlobalTemplateSettings(): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "user.manage")) throw new Error("FORBIDDEN");

  await db.appSetting.deleteMany({ where: { key: TEMPLATE_SETTING_KEYS.global } });

  await db.auditLog.create({
    data: { userId: user.id, action: "DELETE", module: "AppSetting", recordId: TEMPLATE_SETTING_KEYS.global },
  });

  revalidatePath("/settings/print-template");
  return { success: true };
}

// R5 — Logo แยก Action ต่างหาก: รับ Data URI ที่ Client แปลงมาแล้วผ่าน Hidden Field
// ("logoDataUri") แต่ Re-validate ซ้ำทั้ง MIME/ขนาดฝั่งนี้เสมอ ไม่เชื่อ Client Validate
// อย่างเดียว — ไม่เขียนไฟล์ลง /public เด็ดขาด เก็บ Data URI เต็มลง AppSetting ตรงๆ
export async function updateLogo(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "user.manage")) throw new Error("FORBIDDEN");

  const dataUri = String(formData.get("logoDataUri") || "");
  if (!dataUri) {
    return { success: false, error: "กรุณาเลือกไฟล์รูปโลโก้" };
  }

  const result = validateLogoDataUri(dataUri);
  if (!result.valid) {
    return { success: false, error: result.error, fieldErrors: { logoDataUri: result.error } };
  }

  await db.appSetting.upsert({
    where: { key: TEMPLATE_SETTING_KEYS.logo },
    create: { key: TEMPLATE_SETTING_KEYS.logo, value: dataUri },
    update: { value: dataUri },
  });

  await db.auditLog.create({
    data: { userId: user.id, action: "UPDATE", module: "AppSetting", recordId: "template.logo", newValue: { updated: true } },
  });

  revalidatePath("/settings/print-template");
  return { success: true };
}

export async function removeLogo(): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "user.manage")) throw new Error("FORBIDDEN");

  await db.appSetting.deleteMany({ where: { key: TEMPLATE_SETTING_KEYS.logo } });

  await db.auditLog.create({
    data: { userId: user.id, action: "DELETE", module: "AppSetting", recordId: "template.logo" },
  });

  revalidatePath("/settings/print-template");
  return { success: true };
}

// R5 — Per-Document Override: useGlobal=1 ลบ Override ทิ้ง (กลับไปใช้ Global ล้วนๆ)
// useGlobal=0 บันทึก Override เต็มชุด (4 Field ไม่รวม logoSize ตามที่อนุมัติว่า Logo
// เป็น Global-only ห้าม Override รายเอกสาร)
export async function updateDocumentOverride(docType: DocumentTypeKey, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "user.manage")) throw new Error("FORBIDDEN");

  const key = TEMPLATE_SETTING_KEYS.override(docType);
  const useGlobal = formData.get("useGlobal") === "1";

  if (useGlobal) {
    await db.appSetting.deleteMany({ where: { key } });
    await db.auditLog.create({
      data: { userId: user.id, action: "DELETE", module: "AppSetting", recordId: key },
    });
    revalidatePath("/settings/print-template");
    return { success: true };
  }

  const raw = documentTemplateOverrideSchema.safeParse({
    showAddress: checkboxValue(formData, "showAddress"),
    showPhone: checkboxValue(formData, "showPhone"),
    showTaxId: checkboxValue(formData, "showTaxId"),
    footerNote: String(formData.get("footerNote") || ""),
    fontFamily: String(formData.get("fontFamily") || ""),
    bodyFontSize: String(formData.get("bodyFontSize") || ""),
    headingFontSize: String(formData.get("headingFontSize") || ""),
    spacingDensity: String(formData.get("spacingDensity") || ""),
    contentPadding: String(formData.get("contentPadding") || ""),
    blockOrder: parseBlockOrderField(formData),
    headerLayout: parseHeaderLayoutField(formData),
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }

  const value = JSON.stringify(raw.data);
  await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });

  await db.auditLog.create({
    data: { userId: user.id, action: "UPDATE", module: "AppSetting", recordId: key, newValue: raw.data },
  });

  revalidatePath("/settings/print-template");
  return { success: true };
}
