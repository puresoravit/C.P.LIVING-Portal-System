"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const vatRateSchema = z.object({
  ratePct: z.coerce.number().min(0).max(100),
  effectiveFrom: z.coerce.date(),
});

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// ข้อ 26: Admin กำหนด VAT Rate ใหม่ได้พร้อม Effective Date — ห้าม hardcode ในโค้ด
// เมื่อตั้ง rate ใหม่ ต้องปิดวันหมดอายุของ rate เดิมอัตโนมัติ (วันก่อนหน้าที่ rate ใหม่เริ่ม)
export async function createVatRate(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "price.edit")) throw new Error("FORBIDDEN"); // ใช้สิทธิ์เดียวกับ price.edit (OWNER_ADMIN เท่านั้น)

  const raw = vatRateSchema.parse({
    ratePct: formData.get("ratePct"),
    effectiveFrom: formData.get("effectiveFrom"),
  });

  await db.$transaction(async (tx) => {
    // ปิด rate เดิมที่ยังเปิดอยู่ (effectiveTo = null) ให้จบก่อนวันที่ rate ใหม่เริ่ม 1 วัน
    const dayBefore = new Date(raw.effectiveFrom);
    dayBefore.setDate(dayBefore.getDate() - 1);

    await tx.vatRate.updateMany({
      where: { effectiveTo: null },
      data: { effectiveTo: dayBefore },
    });

    const vatRate = await tx.vatRate.create({
      data: { ratePct: raw.ratePct, effectiveFrom: raw.effectiveFrom },
    });

    await tx.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "VatRate", recordId: vatRate.id, newValue: raw },
    });
  });

  revalidatePath("/settings/vat");
}
