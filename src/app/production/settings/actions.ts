"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PRODUCTION_SETTING_KEYS, parseDepartmentsText, parseSizesText, parseMaxFabricsPerPlacementText } from "@/lib/production-settings";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function updateProductionSettings(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productionSetting.manage")) throw new Error("FORBIDDEN");

  const sizes = parseSizesText(String(formData.get("sizes") || ""));
  if (sizes.length === 0) {
    return { success: false, error: "กรุณากรอกไซส์อย่างน้อย 1 รายการ", fieldErrors: { sizes: "กรุณากรอกไซส์อย่างน้อย 1 รายการ" } };
  }

  const departments = parseDepartmentsText(String(formData.get("departments") || ""));
  if (departments.length === 0) {
    return {
      success: false,
      error: "กรุณากรอกแผนกอย่างน้อย 1 แผนก",
      fieldErrors: { departments: "กรุณากรอกแผนกอย่างน้อย 1 แผนก" },
    };
  }

  const customerPoStatuses = parseSizesText(String(formData.get("customerPoStatuses") || ""));
  if (customerPoStatuses.length === 0) {
    return {
      success: false,
      error: "กรุณากรอกสถานะออเดอร์ลูกค้าอย่างน้อย 1 รายการ",
      fieldErrors: { customerPoStatuses: "กรุณากรอกสถานะออเดอร์ลูกค้าอย่างน้อย 1 รายการ" },
    };
  }

  const productionOrderStatuses = parseSizesText(String(formData.get("productionOrderStatuses") || ""));
  if (productionOrderStatuses.length === 0) {
    return {
      success: false,
      error: "กรุณากรอกสถานะใบสั่งผลิตอย่างน้อย 1 รายการ",
      fieldErrors: { productionOrderStatuses: "กรุณากรอกสถานะใบสั่งผลิตอย่างน้อย 1 รายการ" },
    };
  }

  const maxGussetCount = Number(formData.get("maxGussetCount") || 0);
  if (!Number.isFinite(maxGussetCount) || maxGussetCount <= 0) {
    return { success: false, error: "จำนวนกุ๊นสูงสุดต้องเป็นตัวเลขมากกว่า 0", fieldErrors: { maxGussetCount: "จำนวนกุ๊นสูงสุดต้องเป็นตัวเลขมากกว่า 0" } };
  }

  const maxFabricsPerPlacement = parseMaxFabricsPerPlacementText(String(formData.get("maxFabricsPerPlacement") || ""));

  const printCopies = Number(formData.get("printCopies") || 0);
  if (!Number.isInteger(printCopies) || printCopies <= 0) {
    return { success: false, error: "จำนวนสำเนาใบสั่งผลิตต้องเป็นจำนวนเต็มมากกว่า 0", fieldErrors: { printCopies: "จำนวนสำเนาต้องเป็นจำนวนเต็มมากกว่า 0" } };
  }

  const inProgressStatus = String(formData.get("inProgressStatus") || "").trim();
  if (!inProgressStatus) {
    return { success: false, error: "กรุณากรอกสถานะเมื่อเริ่มผลิต", fieldErrors: { inProgressStatus: "กรุณากรอกสถานะเมื่อเริ่มผลิต" } };
  }

  // CP7 — ภาค/ปลายทาง ว่างได้ (ไม่บังคับใช้ทุกจุดส่ง — แค่ป้ายชื่อไว้นับ)
  const destinations = parseSizesText(String(formData.get("destinations") || ""));

  const values: Record<string, string> = {
    [PRODUCTION_SETTING_KEYS.sizes]: JSON.stringify(sizes),
    [PRODUCTION_SETTING_KEYS.departments]: JSON.stringify(departments),
    [PRODUCTION_SETTING_KEYS.customerPoStatuses]: JSON.stringify(customerPoStatuses),
    [PRODUCTION_SETTING_KEYS.productionOrderStatuses]: JSON.stringify(productionOrderStatuses),
    [PRODUCTION_SETTING_KEYS.maxGussetCount]: String(Math.floor(maxGussetCount)),
    [PRODUCTION_SETTING_KEYS.maxFabricsPerPlacement]: JSON.stringify(maxFabricsPerPlacement),
    [PRODUCTION_SETTING_KEYS.printCopies]: String(printCopies),
    [PRODUCTION_SETTING_KEYS.inProgressStatus]: inProgressStatus,
    [PRODUCTION_SETTING_KEYS.destinations]: JSON.stringify(destinations),
  };

  for (const [key, value] of Object.entries(values)) {
    await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  await db.auditLog.create({
    data: { userId: user.id, action: "UPDATE", module: "AppSetting", recordId: "production", newValue: { sizes, departments, customerPoStatuses, productionOrderStatuses, maxGussetCount, maxFabricsPerPlacement, printCopies, inProgressStatus, destinations } },
  });

  revalidatePath("/production/settings");
  return { success: true };
}
