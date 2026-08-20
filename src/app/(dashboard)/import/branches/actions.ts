"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function validateBranchImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "branch.edit")) throw new Error("FORBIDDEN");

  const customers = await db.customer.findMany({ select: { id: true, code: true } });
  const customerByCode = new Map(customers.map((c) => [c.code, c.id]));

  const existingBranches = await db.branch.findMany({ select: { customerId: true, code: true } });
  const existingKeys = new Set(existingBranches.map((b) => `${b.customerId}::${b.code}`));
  const seenInBatch = new Set<string>();

  return rows.map((raw, idx) => {
    const rowNum = idx + 2;
    const customerCode = String(raw.customerCode ?? "").trim();
    const code = String(raw.code ?? "").trim();
    const name = String(raw.name ?? "").trim();

    if (!customerCode) return { row: rowNum, valid: false, error: "ไม่มีรหัสลูกค้า (customerCode)" };
    const customerId = customerByCode.get(customerCode);
    if (!customerId) return { row: rowNum, valid: false, error: `ไม่พบลูกค้าที่มีรหัส "${customerCode}"` };
    if (!code) return { row: rowNum, valid: false, error: "ไม่มีรหัสสาขา (code)" };
    if (!name) return { row: rowNum, valid: false, error: "ไม่มีชื่อสาขา (name)" };

    const key = `${customerId}::${code}`;
    if (existingKeys.has(key)) return { row: rowNum, valid: false, error: `รหัสสาขา "${code}" ซ้ำกับที่มีอยู่แล้วของลูกค้ารายนี้` };
    if (seenInBatch.has(key)) return { row: rowNum, valid: false, error: `รหัสสาขา "${code}" ซ้ำกันเองในไฟล์ (ลูกค้าเดียวกัน)` };
    seenInBatch.add(key);

    return {
      row: rowNum,
      valid: true,
      data: {
        customerCode, // เก็บไว้แสดง preview เท่านั้น — commitBranchImport จะตัดออกก่อน insert
        customerId,
        code,
        name,
        taxBranchCode: raw.taxBranchCode ? String(raw.taxBranchCode) : undefined,
        address: raw.address ? String(raw.address) : undefined,
        province: raw.province ? String(raw.province) : undefined,
        postalCode: raw.postalCode ? String(raw.postalCode) : undefined,
        phone: raw.phone ? String(raw.phone) : undefined,
        contactPerson: raw.contactPerson ? String(raw.contactPerson) : undefined,
        note: raw.note ? String(raw.note) : undefined,
      },
    };
  });
}

export async function commitBranchImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "branch.edit")) throw new Error("FORBIDDEN");

  let imported = 0;
  for (const row of rows) {
    const { customerCode, ...data } = row;
    const branch = await db.branch.create({ data });
    await db.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "Branch", recordId: branch.id, newValue: { ...data, source: "ExcelImport" } },
    });
    imported++;
  }

  revalidatePath("/branches");
  return { imported };
}
