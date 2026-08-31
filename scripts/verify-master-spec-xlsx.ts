// Round-trip verification (2026-08-29) — อ่าน Excel ที่ generate กลับมาผ่าน pipeline เดียวกับ
// import จริง (worksheetToRows → parseMasterSpecSheets) แล้วเทียบกับ JSON source ทุก field
// ที่มีผลต่อ canonical spec — ตัวเลข JSON / Excel / preview ต้องตรงกันเป๊ะ (Owner กำหนด)
//
// รัน: npx tsx scripts/verify-master-spec-xlsx.ts

import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { resolve } from "path";
import { worksheetToRows } from "../src/lib/excel-import";
import { buildSpecKey, parseMasterSpecSheets } from "../src/lib/master-spec-import";

async function main() {
  const base = resolve(__dirname, "../docs/production-module/master-spec-data");
  const json = JSON.parse(readFileSync(`${base}/master-spec-final.json`, "utf8"));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(`${base}/master-spec-import.xlsx`);
  const specRows = worksheetToRows(wb.getWorksheet("Specs")!);
  const fabricRows = worksheetToRows(wb.getWorksheet("Fabrics")!);
  const layerRows = worksheetToRows(wb.getWorksheet("Layers")!);

  const { specs, errors } = parseMasterSpecSheets(specRows, fabricRows, layerRows);
  if (errors.length > 0) {
    console.error("parse errors:", errors);
    process.exit(1);
  }

  const problems: string[] = [];
  const jsonSpecs: any[] = json.specs;
  if (specs.length !== jsonSpecs.length) problems.push(`จำนวน specs ไม่ตรง: excel=${specs.length} json=${jsonSpecs.length}`);

  const parsedByKey = new Map(specs.map((s) => [s.specKey, s]));
  for (const js of jsonSpecs) {
    const key = buildSpecKey(js.model, js.variant, js.thicknessKey, js.gussetCount);
    const ps = parsedByKey.get(key);
    if (!ps) {
      problems.push(`หายจาก Excel: ${key}`);
      continue;
    }
    if (ps.fabrics.length !== js.fabrics.length) problems.push(`${key}: fabrics excel=${ps.fabrics.length} json=${js.fabrics.length}`);
    if (ps.layers.length !== js.layers.length) problems.push(`${key}: layers excel=${ps.layers.length} json=${js.layers.length}`);

    for (const jf of js.fabrics) {
      const pf = ps.fabrics.find((f) => f.placement === jf.placement && f.seq === jf.seq);
      if (!pf) {
        problems.push(`${key}: fabric ${jf.placement}/${jf.seq} หายจาก Excel`);
        continue;
      }
      for (const field of ["fabricName", "fabricCode", "waddingWeight", "foamThickness", "colorNote"] as const) {
        const jsonVal = jf[field] ?? null;
        const parsedVal = pf[field] ?? null;
        if (jsonVal !== parsedVal) problems.push(`${key}: fabric ${jf.placement}/${jf.seq} field ${field}: excel="${parsedVal}" json="${jsonVal}"`);
      }
      const jsonExtra = jf.extra != null ? JSON.stringify(jf.extra) : null;
      const parsedExtra = pf.extra != null ? JSON.stringify(pf.extra) : null;
      if (jsonExtra !== parsedExtra) problems.push(`${key}: fabric ${jf.placement}/${jf.seq} extra ไม่ตรง`);
    }
    js.layers.forEach((jl: any, idx: number) => {
      const pl = ps.layers[idx]; // parse เรียงตาม seq แล้ว — ต้องตรงตำแหน่งเป๊ะ (ลำดับโครงสร้างจริง)
      if (!pl || pl.seq !== jl.seq || pl.material !== jl.material || pl.layerSpec !== jl.spec) {
        problems.push(`${key}: layer ตำแหน่ง ${idx} ไม่ตรง: excel=${JSON.stringify(pl)} json=${JSON.stringify(jl)}`);
      }
    });
  }

  const fabricTotal = specs.reduce((n, s) => n + s.fabrics.length, 0);
  const layerTotal = specs.reduce((n, s) => n + s.layers.length, 0);
  console.log(`Excel→parse: specs=${specs.length} fabrics=${fabricTotal} layers=${layerTotal}`);

  if (problems.length > 0) {
    console.error(`ROUND-TRIP FAILED (${problems.length} จุด):`);
    for (const p of problems) console.error(" -", p);
    process.exit(1);
  }
  console.log("ROUND-TRIP OK — Excel ตรงกับ JSON source ทุก field ทุกแถว (รวมลำดับ layer)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
