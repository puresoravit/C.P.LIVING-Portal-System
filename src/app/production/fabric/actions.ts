"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productionItemFabricInputSchema, productionItemLayerInputSchema } from "@/lib/validation";
import { getMaxFabricsForPlacement, getProductionSettings } from "@/lib/production-settings";
import { assignFabricSeq } from "@/lib/production-spec-hash";
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

// Master Spec edit (2026-08-29) — Master Spec เป็น master data (ไม่ใช่เอกสาร): แก้แบบ
// update-in-place ใน transaction เดียว + เก็บ before/after เต็มก้อนใน AuditLog — ไม่มีปุ่ม/
// action ลบ spec เลย (ห้าม hard delete ตามที่ Owner สั่ง) — การแก้ที่นี่ไม่กระทบ Production
// Revision ที่ Confirm แล้วโดยโครงสร้าง: ProductionItem เป็น snapshot อิสระ ไม่มี FK กลับมา
// ที่ master (ดูคอมเมนต์ที่ model ProductionMasterSpec)
//
// key identity (specName/variant/thickness/gussetCount) แก้ไม่ได้จากฟอร์มนี้ — เป็น identity
// ของสูตร ถ้าต้องเปลี่ยนจริงให้เป็นงานแยกที่ Owner สั่งเฉพาะ

export async function updateMasterSpec(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productionMasterSpec.manage")) throw new Error("FORBIDDEN");

  let fabrics: z.infer<typeof productionItemFabricInputSchema>[];
  let layers: z.infer<typeof productionItemLayerInputSchema>[];
  try {
    fabrics = z.array(productionItemFabricInputSchema).min(1, "ต้องมีผ้าอย่างน้อย 1").parse(JSON.parse(String(formData.get("fabricsJson") || "[]")));
    layers = z.array(productionItemLayerInputSchema).min(1, "ต้องมีโครงสร้างอย่างน้อย 1").parse(JSON.parse(String(formData.get("layersJson") || "[]")));
  } catch {
    return { success: false, error: "กรุณากรอกผ้าและโครงสร้างให้ครบ (อย่างน้อยอย่างละ 1 รายการ)" };
  }

  const settings = await getProductionSettings();
  const countByPlacement = new Map<string, number>();
  for (const f of fabrics) countByPlacement.set(f.placement, (countByPlacement.get(f.placement) ?? 0) + 1);
  for (const [placement, count] of countByPlacement) {
    const max = getMaxFabricsForPlacement(settings, placement);
    if (count > max) {
      return { success: false, error: `ตำแหน่งผ้า "${placement}" มีได้สูงสุด ${max} ผืน (ตั้งค่าได้ที่หน้าตั้งค่าการผลิต)` };
    }
  }

  // Head link — "" = unlinked (ยกเลิกการผูกได้), ค่า "model:<id>"|"product:<id>" ต้องชี้ของจริง
  const headRaw = String(formData.get("head") || "");
  let headKind: "product" | "model" | null = null;
  let headId: string | null = null;
  if (headRaw) {
    const [kind, ...rest] = headRaw.split(":");
    const targetId = rest.join(":");
    if (kind === "model") {
      const model = await db.productModel.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!model) return { success: false, error: "ไม่พบรุ่นสินค้าที่เลือก กรุณาโหลดหน้าใหม่" };
      headKind = "model";
      headId = model.id;
    } else if (kind === "product") {
      const product = await db.product.findUnique({ where: { id: targetId }, select: { id: true, parentProductId: true, modelId: true } });
      // ต้องเป็น Family Head จริง (Standalone/Anchor) — ไซส์ย่อยผูกไม่ได้ ให้ผูกที่หัวตระกูล
      if (!product || product.parentProductId || product.modelId) {
        return { success: false, error: "สินค้าที่เลือกไม่ใช่หัวตระกูล (Family Head) กรุณาเลือกรุ่นสินค้าหรือสินค้าหัวตระกูล" };
      }
      headKind = "product";
      headId = product.id;
    } else {
      return { success: false, error: "ค่าการผูกสินค้าไม่ถูกต้อง" };
    }
  }

  const note = String(formData.get("note") || "").trim() || null;
  const approxThickness = String(formData.get("approxThickness") || "").trim() || null;
  const fabricsWithSeq = assignFabricSeq(fabrics);

  await db.$transaction(async (tx) => {
    const before = await tx.productionMasterSpec.findUniqueOrThrow({
      where: { id },
      include: { fabrics: { orderBy: [{ placement: "asc" }, { seq: "asc" }] }, layers: { orderBy: { seq: "asc" } } },
    });

    await tx.productionMasterSpec.update({
      where: { id },
      data: { headKind, headId, note, approxThickness },
    });

    // Template replacement — แถวลูกเป็นเนื้อหาปัจจุบันของสูตร (ไม่ใช่ประวัติ) ประวัติเต็มอยู่ใน
    // AuditLog.oldValue ด้านล่าง และใบสั่งผลิตที่ Confirm แล้ว snapshot ไว้อิสระอยู่แล้ว
    await tx.productionMasterFabric.deleteMany({ where: { specId: id } });
    await tx.productionMasterLayer.deleteMany({ where: { specId: id } });
    await tx.productionMasterFabric.createMany({
      data: fabricsWithSeq.map((f) => ({
        specId: id,
        placement: f.placement,
        seq: f.seq,
        fabricName: f.fabricName,
        fabricCode: f.fabricCode || null,
        waddingWeight: f.waddingWeight || null,
        foamThickness: f.foamThickness || null,
        colorNote: f.colorNote || null,
        displayOverride: f.displayOverride || null,
        printVisible: f.printVisible,
      })),
    });
    await tx.productionMasterLayer.createMany({
      data: layers.map((l, idx) => ({
        specId: id,
        seq: idx,
        material: l.material,
        layerSpec: l.spec,
        displayOverride: l.displayOverride || null,
        printVisible: l.printVisible,
      })),
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        module: "ProductionMasterSpec",
        recordId: id,
        oldValue: {
          headKind: before.headKind,
          headId: before.headId,
          note: before.note,
          approxThickness: before.approxThickness,
          fabrics: before.fabrics.map((f) => ({
            placement: f.placement, seq: f.seq, fabricName: f.fabricName, fabricCode: f.fabricCode,
            waddingWeight: f.waddingWeight, foamThickness: f.foamThickness, colorNote: f.colorNote,
            displayOverride: f.displayOverride, printVisible: f.printVisible,
          })),
          layers: before.layers.map((l) => ({
            seq: l.seq, material: l.material, spec: l.layerSpec, displayOverride: l.displayOverride, printVisible: l.printVisible,
          })),
        },
        newValue: {
          headKind, headId, note, approxThickness,
          fabrics: fabricsWithSeq.map((f) => ({
            placement: f.placement, seq: f.seq, fabricName: f.fabricName, fabricCode: f.fabricCode ?? null,
            waddingWeight: f.waddingWeight ?? null, foamThickness: f.foamThickness ?? null, colorNote: f.colorNote ?? null,
            displayOverride: f.displayOverride ?? null, printVisible: f.printVisible,
          })),
          layers: layers.map((l, idx) => ({
            seq: idx, material: l.material, spec: l.spec, displayOverride: l.displayOverride ?? null, printVisible: l.printVisible,
          })),
        },
      },
    });
  });

  revalidatePath("/production/fabric");
  revalidatePath(`/production/fabric/${id}`);
  redirect(`/production/fabric/${id}`);
}
