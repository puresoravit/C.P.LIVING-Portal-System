import { db } from "@/lib/db";
import { getProductionSettings } from "@/lib/production-settings";
import {
  parseMasterSpecSheets,
  validateMasterSpecs,
  displayMasterSpecName,
  type RawSheetRow,
  type HeadCandidate,
  type ValidatedMasterSpec,
} from "@/lib/master-spec-import";

// ชั้นประกอบ DB lookups + parse/validate ให้เป็น code path เดียว — server action (validate/
// commit) และ dry-run script ใช้ฟังก์ชันนี้ร่วมกัน เพื่อให้ preview ที่ Owner เห็นตรงกับสิ่งที่
// commit จะทำจริงเสมอ (ไม่มี logic แยก 2 ทาง)

export type MasterSpecImportSheets = {
  specs: RawSheetRow[];
  fabrics: RawSheetRow[];
  layers: RawSheetRow[];
};

export type MasterSpecImportPreview = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  specCount: number;
  fabricCount: number;
  layerCount: number;
  linkedCount: number;
  unlinkedCount: number;
  specSummaries: { displayName: string; specKey: string; fabricCount: number; layerCount: number; linkedTo: string | null }[];
};

export async function loadMasterSpecImportContext() {
  const [existing, models, headProducts, settings] = await Promise.all([
    db.productionMasterSpec.findMany({ select: { specName: true, variant: true, thickness: true, gussetCount: true } }),
    db.productModel.findMany({ where: { active: true }, select: { id: true, name: true } }),
    // Head products = Standalone/Anchor เท่านั้น (parentProductId null และไม่ผูก model) —
    // Product ที่ผูก modelId มี head เป็น model อยู่แล้ว (ตาม resolveAccessHead) จับคู่ผ่าน
    // ชื่อ model แทน ไม่จับผ่านชื่อ product ไซส์ย่อย
    db.product.findMany({ where: { active: true, parentProductId: null, modelId: null }, select: { id: true, name: true } }),
    getProductionSettings(),
  ]);

  const existingSpecKeys = new Set(existing.map((s) => [s.specName, s.variant, s.thickness, s.gussetCount].join("|")));
  const headCandidates: HeadCandidate[] = [
    ...models.map((m) => ({ kind: "model" as const, id: m.id, name: m.name })),
    ...headProducts.map((p) => ({ kind: "product" as const, id: p.id, name: p.name })),
  ];
  return {
    existingSpecKeys,
    headCandidates,
    maxGussetCount: settings.maxGussetCount,
    maxFabricsPerPlacement: settings.maxFabricsPerPlacement,
  };
}

/** Commit ทั้งชุดใน transaction เดียว all-or-nothing — แยกออกมาจาก server action เพื่อให้
 * action (ปุ่มยืนยันบนหน้า import) และ import script ใช้ code path เดียวกันเป๊ะ ผู้เรียกต้อง
 * ตรวจ preview.ok ก่อนเสมอ (function นี้ไม่ validate ซ้ำ — เป็นหน้าที่ของผู้เรียกผ่าน
 * runMasterSpecValidation ตาม flow ที่อนุมัติ) */
export async function commitValidatedMasterSpecs(
  actorUserId: string,
  validatedSpecs: ValidatedMasterSpec[],
  preview: MasterSpecImportPreview
): Promise<void> {
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
        userId: actorUserId,
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
}

export async function runMasterSpecValidation(sheets: MasterSpecImportSheets): Promise<{
  preview: MasterSpecImportPreview;
  validatedSpecs: ValidatedMasterSpec[];
}> {
  const { specs, errors: parseErrors } = parseMasterSpecSheets(sheets.specs, sheets.fabrics, sheets.layers);
  const context = await loadMasterSpecImportContext();
  const result = validateMasterSpecs(specs, context);
  const errors = [...parseErrors, ...result.errors];

  const headNameById = new Map(context.headCandidates.map((c) => [`${c.kind}:${c.id}`, c.name]));

  return {
    preview: {
      ok: errors.length === 0,
      errors,
      warnings: result.warnings,
      specCount: result.specs.length,
      fabricCount: result.specs.reduce((n, s) => n + s.fabrics.length, 0),
      layerCount: result.specs.reduce((n, s) => n + s.layers.length, 0),
      linkedCount: result.linkedCount,
      unlinkedCount: result.unlinkedCount,
      specSummaries: result.specs.map((s) => ({
        displayName: displayMasterSpecName(s),
        specKey: s.specKey,
        fabricCount: s.fabrics.length,
        layerCount: s.layers.length,
        linkedTo: s.headKind && s.headId ? headNameById.get(`${s.headKind}:${s.headId}`) ?? null : null,
      })),
    },
    validatedSpecs: result.specs,
  };
}
