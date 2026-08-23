"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { customerSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "customer.edit")) throw new Error("FORBIDDEN");

  const raw = customerSchema.safeParse({
    code: formData.get("code"),
    companyName: formData.get("companyName"),
    taxId: formData.get("taxId") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    creditTerm: formData.get("creditTerm") || "CASH",
    address: formData.get("address") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  // ข้อ 61: ป้องกัน Customer Code ซ้ำ — เช็คก่อนเพื่อโชว์ error ที่เข้าใจง่าย
  // (มี @unique ใน schema เป็น safety net อีกชั้นด้วย)
  const existing = await db.customer.findUnique({ where: { code: parsed.code } });
  if (existing) {
    const error = `รหัสลูกค้า "${parsed.code}" มีอยู่แล้วในระบบ`;
    return { success: false, error, fieldErrors: { code: error } };
  }

  const customer = await db.customer.create({ data: parsed });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      module: "Customer",
      recordId: customer.id,
      newValue: parsed,
    },
  });

  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomer(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "customer.edit")) throw new Error("FORBIDDEN");

  const raw = customerSchema.safeParse({
    code: formData.get("code"),
    companyName: formData.get("companyName"),
    taxId: formData.get("taxId") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    creditTerm: formData.get("creditTerm") || "CASH",
    address: formData.get("address") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const existing = await db.customer.findUnique({ where: { code: parsed.code } });
  if (existing && existing.id !== id) {
    const error = `รหัสลูกค้า "${parsed.code}" มีอยู่แล้วในระบบ`;
    return { success: false, error, fieldErrors: { code: error } };
  }

  const before = await db.customer.findUnique({ where: { id } });
  const customer = await db.customer.update({ where: { id }, data: parsed });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "Customer",
      recordId: customer.id,
      oldValue: before ?? undefined,
      newValue: parsed,
    },
  });

  revalidatePath("/customers");
  return { success: true };
}

// ข้อ 48: ห้าม Hard Delete Master Data ที่เคยถูกใช้ — ใช้ Active/Inactive แทนเสมอ
export async function toggleCustomerActive(id: string) {
  const user = await requireUser();
  if (!can(user.role, "customer.edit")) throw new Error("FORBIDDEN");

  const customer = await db.customer.findUniqueOrThrow({ where: { id } });
  const updated = await db.customer.update({
    where: { id },
    data: { active: !customer.active },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: updated.active ? "ACTIVATE" : "DEACTIVATE",
      module: "Customer",
      recordId: id,
      oldValue: { active: customer.active },
      newValue: { active: updated.active },
    },
  });

  revalidatePath("/customers");
}
