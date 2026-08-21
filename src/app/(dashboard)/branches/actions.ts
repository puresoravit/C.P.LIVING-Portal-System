"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { branchSchema } from "@/lib/validation";
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

export async function createBranch(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "branch.edit")) throw new Error("FORBIDDEN");

  const raw = branchSchema.safeParse({
    customerId: formData.get("customerId"),
    code: formData.get("code"),
    name: formData.get("name"),
    taxBranchCode: formData.get("taxBranchCode") || undefined,
    address: formData.get("address") || undefined,
    province: formData.get("province") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    phone: formData.get("phone") || undefined,
    contactPerson: formData.get("contactPerson") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  // ข้อ 61: Branch Code ซ้ำภายใต้ Customer เดียวกันห้าม (มี @@unique เป็น safety net)
  const existing = await db.branch.findUnique({
    where: { customerId_code: { customerId: parsed.customerId, code: parsed.code } },
  });
  if (existing) {
    const error = `รหัสสาขา "${parsed.code}" มีอยู่แล้วในลูกค้ารายนี้`;
    return { success: false, error, fieldErrors: { code: error } };
  }

  const branch = await db.branch.create({ data: parsed });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "Branch", recordId: branch.id, newValue: parsed },
  });

  revalidatePath("/branches");
  return { success: true };
}

export async function updateBranch(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "branch.edit")) throw new Error("FORBIDDEN");

  const raw = branchSchema.safeParse({
    customerId: formData.get("customerId"),
    code: formData.get("code"),
    name: formData.get("name"),
    taxBranchCode: formData.get("taxBranchCode") || undefined,
    address: formData.get("address") || undefined,
    province: formData.get("province") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    phone: formData.get("phone") || undefined,
    contactPerson: formData.get("contactPerson") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const existing = await db.branch.findUnique({
    where: { customerId_code: { customerId: parsed.customerId, code: parsed.code } },
  });
  if (existing && existing.id !== id) {
    const error = `รหัสสาขา "${parsed.code}" มีอยู่แล้วในลูกค้ารายนี้`;
    return { success: false, error, fieldErrors: { code: error } };
  }

  const before = await db.branch.findUnique({ where: { id } });
  const branch = await db.branch.update({ where: { id }, data: parsed });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "Branch",
      recordId: branch.id,
      oldValue: before ?? undefined,
      newValue: parsed,
    },
  });

  revalidatePath("/branches");
  return { success: true };
}

export async function toggleBranchActive(id: string) {
  const user = await requireUser();
  if (!can(user.role, "branch.edit")) throw new Error("FORBIDDEN");

  const branch = await db.branch.findUniqueOrThrow({ where: { id } });
  const updated = await db.branch.update({ where: { id }, data: { active: !branch.active } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: updated.active ? "ACTIVATE" : "DEACTIVATE",
      module: "Branch",
      recordId: id,
      oldValue: { active: branch.active },
      newValue: { active: updated.active },
    },
  });

  revalidatePath("/branches");
}
