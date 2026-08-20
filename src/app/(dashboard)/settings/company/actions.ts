"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { COMPANY_SETTING_KEYS } from "@/lib/company-settings";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function updateCompanySettings(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "user.manage")) throw new Error("FORBIDDEN"); // OWNER_ADMIN เท่านั้น

  const values: Record<string, string> = {
    [COMPANY_SETTING_KEYS.name]: String(formData.get("name") || ""),
    [COMPANY_SETTING_KEYS.address]: String(formData.get("address") || ""),
    [COMPANY_SETTING_KEYS.phone]: String(formData.get("phone") || ""),
    [COMPANY_SETTING_KEYS.taxId]: String(formData.get("taxId") || ""),
  };

  for (const [key, value] of Object.entries(values)) {
    await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  await db.auditLog.create({
    data: { userId: user.id, action: "UPDATE", module: "AppSetting", recordId: "company", newValue: values },
  });

  revalidatePath("/settings/company");
}
