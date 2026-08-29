"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import {
  runMasterSpecValidation,
  commitValidatedMasterSpecs,
  type MasterSpecImportSheets,
  type MasterSpecImportPreview,
} from "@/lib/master-spec-import-db";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// Master Spec bulk import (2026-08-29) — flow ที่ Owner อนุมัติ:
// parse (client อ่าน 3 ชีท) → validate (ที่นี่ กับ DB จริง) → preview → Owner กดยืนยัน →
// commit แบบ transaction เดียว all-or-nothing — ห้ามสร้าง/แก้ Product Master เพื่อให้
// mapping ผ่าน (spec ที่หา head ไม่เจอ = unlinked ผูกทีหลังผ่าน UI)

export async function validateMasterSpecImport(sheets: MasterSpecImportSheets): Promise<MasterSpecImportPreview> {
  const user = await requireUser();
  if (!can(user.role, "productionMasterSpec.manage")) throw new Error("FORBIDDEN");
  const { preview } = await runMasterSpecValidation(sheets);
  return preview;
}

export async function commitMasterSpecImport(sheets: MasterSpecImportSheets): Promise<{ success: boolean; errors?: string[]; imported?: { specs: number; fabrics: number; layers: number } }> {
  const user = await requireUser();
  if (!can(user.role, "productionMasterSpec.manage")) throw new Error("FORBIDDEN");

  // Re-validate จาก raw sheets เสมอ — ไม่เชื่อผลที่ client เคยเห็น (สภาพ DB อาจเปลี่ยน
  // ระหว่าง preview กับกดยืนยัน เช่นมีคน import spec เดียวกันไปก่อน)
  const { preview, validatedSpecs } = await runMasterSpecValidation(sheets);
  if (!preview.ok) {
    return { success: false, errors: preview.errors };
  }

  await commitValidatedMasterSpecs(user.id, validatedSpecs, preview);

  revalidatePath("/production/fabric");
  return { success: true, imported: { specs: preview.specCount, fabrics: preview.fabricCount, layers: preview.layerCount } };
}
