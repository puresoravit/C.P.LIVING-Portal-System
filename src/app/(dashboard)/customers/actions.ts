"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { customerSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function createCustomer(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "customer.edit")) throw new Error("FORBIDDEN");

  const parsed = customerSchema.parse({
    code: formData.get("code"),
    companyName: formData.get("companyName"),
    taxId: formData.get("taxId") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    creditTerm: formData.get("creditTerm") || "CASH",
    note: formData.get("note") || undefined,
  });

  // ข้อ 61: ป้องกัน Customer Code ซ้ำ — เช็คก่อนเพื่อโชว์ error ที่เข้าใจง่าย
  // (มี @unique ใน schema เป็น safety net อีกชั้นด้วย)
  const existing = await db.customer.findUnique({ where: { code: parsed.code } });
  if (existing) throw new Error(`รหัสลูกค้า "${parsed.code}" มีอยู่แล้วในระบบ`);

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
}

export async function updateCustomer(id: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "customer.edit")) throw new Error("FORBIDDEN");

  const parsed = customerSchema.parse({
    code: formData.get("code"),
    companyName: formData.get("companyName"),
    taxId: formData.get("taxId") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    creditTerm: formData.get("creditTerm") || "CASH",
    note: formData.get("note") || undefined,
  });

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
