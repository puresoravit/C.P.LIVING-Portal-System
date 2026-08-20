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

const VALID_CREDIT_TERMS = ["CASH", "NET30", "NET60", "NET90"];

export async function validateCustomerImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "customer.edit")) throw new Error("FORBIDDEN");

  const existing = await db.customer.findMany({ select: { code: true } });
  const existingCodes = new Set(existing.map((c) => c.code));
  const seenInBatch = new Set<string>();

  return rows.map((raw, idx) => {
    const rowNum = idx + 2; // แถว 1 คือ header
    const code = String(raw.code ?? "").trim();
    const companyName = String(raw.companyName ?? "").trim();

    if (!code) return { row: rowNum, valid: false, error: "ไม่มีรหัสลูกค้า (code)" };
    if (!companyName) return { row: rowNum, valid: false, error: "ไม่มีชื่อบริษัท (companyName)" };
    if (existingCodes.has(code)) return { row: rowNum, valid: false, error: `รหัสลูกค้า "${code}" ซ้ำกับที่มีอยู่แล้วในระบบ` };
    if (seenInBatch.has(code)) return { row: rowNum, valid: false, error: `รหัสลูกค้า "${code}" ซ้ำกันเองในไฟล์` };

    const creditTerm = String(raw.creditTerm ?? "CASH").trim().toUpperCase() || "CASH";
    if (!VALID_CREDIT_TERMS.includes(creditTerm)) {
      return { row: rowNum, valid: false, error: `creditTerm "${raw.creditTerm}" ไม่ถูกต้อง (ต้องเป็น CASH/NET30/NET60/NET90)` };
    }

    seenInBatch.add(code);
    return {
      row: rowNum,
      valid: true,
      data: {
        code,
        companyName,
        taxId: raw.taxId ? String(raw.taxId) : undefined,
        phone: raw.phone ? String(raw.phone) : undefined,
        email: raw.email ? String(raw.email) : undefined,
        creditTerm,
        note: raw.note ? String(raw.note) : undefined,
      },
    };
  });
}

export async function commitCustomerImport(rows: any[]) {
  const user = await requireUser();
  if (!can(user.role, "customer.edit")) throw new Error("FORBIDDEN");

  let imported = 0;
  for (const row of rows) {
    const customer = await db.customer.create({ data: row });
    await db.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "Customer", recordId: customer.id, newValue: { ...row, source: "ExcelImport" } },
    });
    imported++;
  }

  revalidatePath("/customers");
  return { imported };
}
