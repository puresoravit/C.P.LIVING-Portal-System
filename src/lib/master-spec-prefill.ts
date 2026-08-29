import { db } from "@/lib/db";
import { resolveAccessHead } from "@/lib/product-company-access";
import { displayMasterSpecName } from "@/lib/master-spec-import";
import type { MasterSpecPrefillOption } from "@/components/production/production-order-form";

// Master Spec prefill (2026-08-29) — หา "สูตร Master ที่เกี่ยวข้อง" ให้แต่ละ CustomerPOLine:
// resolve canonical family head ผ่าน resolveAccessHead() (identity เดียวกับที่ specHash ใช้)
// แล้วดึงทุกสูตรที่ผูกกับ head นั้น (ทุก variant/thickness/gusset) — การตัดสินใจว่าใช้สูตรไหน
// เป็นของผู้ใช้/ฟอร์มตามกติกา: exact 1 = prefill, หลายตัว = เลือกเอง, 0 = กรอกเอง ห้ามระบบเดา
// สูตร unlinked (headId null) ไม่มีทาง match โดยนิยาม — ต้องผูกที่หน้าสูตร Master ก่อน

type LineForPrefill = {
  id: string;
  product: { id: string; parentProductId: string | null; modelId: string | null } | null;
};

export async function loadMasterSpecOptionsForLines(lines: LineForPrefill[]): Promise<Record<string, MasterSpecPrefillOption[]>> {
  const headByLineId = new Map<string, { kind: "product" | "model"; id: string }>();
  for (const line of lines) {
    if (line.product) headByLineId.set(line.id, resolveAccessHead(line.product));
  }
  const uniqueHeads = [...new Map([...headByLineId.values()].map((h) => [`${h.kind}:${h.id}`, h])).values()];
  if (uniqueHeads.length === 0) return {};

  const specs = await db.productionMasterSpec.findMany({
    where: { OR: uniqueHeads.map((h) => ({ headKind: h.kind, headId: h.id })) },
    include: {
      fabrics: { orderBy: [{ placement: "asc" }, { seq: "asc" }] },
      layers: { orderBy: { seq: "asc" } },
    },
    orderBy: [{ specName: "asc" }, { variant: "asc" }, { thickness: "asc" }, { gussetCount: "asc" }],
  });

  const optionsByHeadKey = new Map<string, MasterSpecPrefillOption[]>();
  for (const spec of specs) {
    const headKey = `${spec.headKind}:${spec.headId}`;
    if (!optionsByHeadKey.has(headKey)) optionsByHeadKey.set(headKey, []);
    optionsByHeadKey.get(headKey)!.push({
      id: spec.id,
      displayName: displayMasterSpecName(spec),
      gussetCount: spec.gussetCount,
      thickness: spec.thickness,
      fabrics: spec.fabrics.map((f) => ({
        placement: f.placement,
        fabricName: f.fabricName,
        fabricCode: f.fabricCode ?? "",
        waddingWeight: f.waddingWeight ?? "",
        foamThickness: f.foamThickness ?? "",
        colorNote: f.colorNote ?? "",
        displayOverride: f.displayOverride ?? "",
        printVisible: f.printVisible,
      })),
      layers: spec.layers.map((l) => ({
        material: l.material,
        spec: l.layerSpec,
        displayOverride: l.displayOverride ?? "",
        printVisible: l.printVisible,
      })),
    });
  }

  const result: Record<string, MasterSpecPrefillOption[]> = {};
  for (const [lineId, head] of headByLineId) {
    const options = optionsByHeadKey.get(`${head.kind}:${head.id}`);
    if (options && options.length > 0) result[lineId] = options;
  }
  return result;
}
