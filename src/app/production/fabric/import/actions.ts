"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import {
  runMasterSpecValidation,
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

  await db.$transaction(async (tx) => {
    for (const spec of validatedSpecs) {
      const created = await tx.productionMasterSpec.create({
        data: {
          specName: spec.specName,
          variant: spec.variant,
          thickness: spec.thickness,
          gussetCount: spec.gussetCount,
          headKind: spec.headKind,
          headId: spec.headId,
          approxThickness: spec.approxThickness,
          titleRaw: spec.titleRaw,
          note: spec.note,
        },
      });
      await tx.productionMasterFabric.createMany({
        data: spec.fabrics.map((f) => ({
          specId: created.id,
          placement: f.placement,
          seq: f.seq,
          fabricName: f.fabricName,
          fabricCode: f.fabricCode,
          waddingWeight: f.waddingWeight,
          foamThickness: f.foamThickness,
          colorNote: f.colorNote,
          printVisible: f.printVisible,
          extra: f.extra == null ? undefined : (f.extra as object),
        })),
      });
      await tx.productionMasterLayer.createMany({
        data: spec.layers.map((l) => ({
          specId: created.id,
          seq: l.seq,
          material: l.material,
          layerSpec: l.layerSpec,
          printVisible: l.printVisible,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        module: "ProductionMasterSpec",
        recordId: "bulk-import",
        newValue: {
          specCount: preview.specCount,
          fabricCount: preview.fabricCount,
          layerCount: preview.layerCount,
          linkedCount: preview.linkedCount,
          unlinkedCount: preview.unlinkedCount,
        },
      },
    });
  });

  revalidatePath("/production/fabric");
  return { success: true, imported: { specs: preview.specCount, fabrics: preview.fabricCount, layers: preview.layerCount } };
}
