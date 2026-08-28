"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PRODUCTION_SETTING_KEYS, parseDepartmentsText, parseSizesText } from "@/lib/production-settings";
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

  const values: Record<string, string> = {
    [PRODUCTION_SETTING_KEYS.sizes]: JSON.stringify(sizes),
    [PRODUCTION_SETTING_KEYS.departments]: JSON.stringify(departments),
  };

  for (const [key, value] of Object.entries(values)) {
    await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  await db.auditLog.create({
    data: { userId: user.id, action: "UPDATE", module: "AppSetting", recordId: "production", newValue: { sizes, departments } },
  });

  revalidatePath("/production/settings");
  return { success: true };
}
