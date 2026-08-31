// Master Spec bulk import (2026-08-29) — สร้างไฟล์ Excel 3 ชีท (Specs / Fabrics / Layers)
// จาก docs/production-module/master-spec-data/master-spec-final.json (source of truth ที่
// Owner ยืนยัน corrections แล้ว) — Owner ไม่ต้องคีย์ Excel เอง ตามที่ตกลง
//
// รัน: npx tsx scripts/generate-master-spec-xlsx.ts [output.xlsx]
// จากนั้น verify round-trip ด้วย scripts/verify-master-spec-xlsx.ts ก่อนใช้ไฟล์เสมอ

import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { resolve } from "path";
import { buildSpecKey } from "../src/lib/master-spec-import";

type JsonFabric = {
  placementRaw: string;
  placement: string;
  seq: number;
  fabricName: string;
  fabricCode: string | null;
  waddingWeight: string | null;
  foamThickness: string | null;
  colorNote: string | null;
  extra?: unknown;
};
type JsonLayer = { seq: number; material: string; spec: string };
type JsonSpec = {
  model: string;
  titleRaw: string;
  gussetCount: number;
  variant: string;
  thicknessKey: string;
  approxThickness: string | null;
  fabrics: JsonFabric[];
  layers: JsonLayer[];
  flags: string[];
};

async function main() {
  const jsonPath = resolve(__dirname, "../docs/production-module/master-spec-data/master-spec-final.json");
  const outPath = process.argv[2] ?? resolve(__dirname, "../docs/production-module/master-spec-data/master-spec-import.xlsx");
  const data = JSON.parse(readFileSync(jsonPath, "utf8")) as { specs: JsonSpec[] };

  const wb = new ExcelJS.Workbook();

  const specsSheet = wb.addWorksheet("Specs");
  specsSheet.addRow(["specName", "variant", "thickness", "gussetCount", "approxThickness", "titleRaw", "note"]);
  const fabricsSheet = wb.addWorksheet("Fabrics");
  fabricsSheet.addRow(["specKey", "placement", "seq", "fabricName", "fabricCode", "waddingWeight", "foamThickness", "colorNote", "extra", "printVisible"]);
  const layersSheet = wb.addWorksheet("Layers");
  layersSheet.addRow(["specKey", "seq", "material", "spec", "printVisible"]);

  for (const spec of data.specs) {
    const specKey = buildSpecKey(spec.model, spec.variant, spec.thicknessKey, spec.gussetCount);
    // flags ที่เหลือทั้งหมดเป็น informational (Owner เคลียร์จุดบล็อกครบแล้ว) — เก็บลง note
    // เพื่อไม่ให้ข้อสังเกตหายไปตอนแก้ผ่าน UI ภายหลัง
    const note = spec.flags.length > 0 ? spec.flags.join(" | ") : "";
    specsSheet.addRow([spec.model, spec.variant, spec.thicknessKey, spec.gussetCount, spec.approxThickness ?? "", spec.titleRaw, note]);
    for (const f of spec.fabrics) {
      fabricsSheet.addRow([
        specKey,
        f.placement,
        f.seq,
        f.fabricName,
        f.fabricCode ?? "",
        f.waddingWeight ?? "",
        f.foamThickness ?? "",
        f.colorNote ?? "",
        f.extra != null ? JSON.stringify(f.extra) : "",
        "TRUE", // ข้อมูลชุดนี้ไม่ได้ระบุการซ่อน — ทุกแถวแสดงบนใบพิมพ์ Owner ติ๊กซ่อนเองผ่าน UI ภายหลัง
      ]);
    }
    for (const l of spec.layers) {
      layersSheet.addRow([specKey, l.seq, l.material, l.spec, "TRUE"]);
    }
  }

  await wb.xlsx.writeFile(outPath);
  console.log(`เขียน ${outPath}`);
  console.log(`Specs: ${data.specs.length} แถว | Fabrics: ${data.specs.reduce((n, s) => n + s.fabrics.length, 0)} แถว | Layers: ${data.specs.reduce((n, s) => n + s.layers.length, 0)} แถว`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
