// Master Spec bulk import (2026-08-29) — pure functions สำหรับ parse/validate ข้อมูลจาก
// Excel 3 ชีท (Specs / Fabrics / Layers เชื่อมด้วย specKey) — แยกจาก DB ทั้งหมดเพื่อ unit
// test ตรงๆ ได้ ฝั่ง server action (production/fabric/import/actions.ts) เป็นคนส่ง lookup
// จาก DB จริงเข้ามา (existing keys, head candidates, caps จาก production-settings)
//
// Flow ตามที่ Owner อนุมัติ: parse → validate → preview/report → Owner review → import
// (transaction all-or-nothing) — validate ห้ามสร้าง/แก้ Product Master เพื่อให้ mapping ผ่าน:
// specName ที่หา head ไม่เจอ = unlinked (ผูกทีหลังผ่าน UI) ไม่ใช่ error

export type RawSheetRow = Record<string, unknown>;

export type ParsedMasterFabric = {
  placement: string;
  seq: number;
  fabricName: string;
  fabricCode: string | null;
  waddingWeight: string | null;
  foamThickness: string | null;
  colorNote: string | null;
  printVisible: boolean;
  extra: unknown | null;
};

export type ParsedMasterLayer = {
  seq: number;
  material: string;
  layerSpec: string;
  printVisible: boolean;
};

export type ParsedMasterSpec = {
  specKey: string;
  specName: string;
  variant: string;
  thickness: string;
  gussetCount: number;
  approxThickness: string | null;
  titleRaw: string | null;
  note: string | null;
  fabrics: ParsedMasterFabric[];
  layers: ParsedMasterLayer[];
};

export function buildSpecKey(specName: string, variant: string, thickness: string, gussetCount: number): string {
  return [specName, variant, thickness, gussetCount].join("|");
}

/** ชื่อแสดงเป็นภาษาคน — gussetCount 0 ไม่แสดง "0 กุ๊น" (Owner ยืนยัน) */
export function displayMasterSpecName(spec: Pick<ParsedMasterSpec, "specName" | "variant" | "thickness" | "gussetCount">): string {
  let name = spec.specName;
  if (spec.variant) name += ` (${spec.variant})`;
  if (spec.thickness) name += ` ${spec.thickness}"`;
  if (spec.gussetCount > 0) name += ` — ${spec.gussetCount} กุ๊น`;
  return name;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}
function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function parseBoolCell(v: unknown): boolean {
  const s = str(v).toUpperCase();
  return s !== "FALSE" && s !== "0" && s !== "NO";
}

/** ประกอบ 3 ชีทเป็น spec เต็ม + ตรวจ cross-reference (ทุก fabric/layer ต้องชี้ specKey ที่มีจริง,
 * ทุก spec ต้องมีผ้า ≥1 และโครงสร้าง ≥1, key/seq ห้ามซ้ำ) — คืน errors เป็นภาษาคนต่อแถว */
export function parseMasterSpecSheets(
  specRows: RawSheetRow[],
  fabricRows: RawSheetRow[],
  layerRows: RawSheetRow[]
): { specs: ParsedMasterSpec[]; errors: string[] } {
  const errors: string[] = [];
  const specByKey = new Map<string, ParsedMasterSpec>();

  specRows.forEach((row, i) => {
    const rowNo = i + 2; // แถว Excel จริง (แถว 1 = header)
    const specName = str(row.specName);
    if (!specName) {
      errors.push(`Specs แถว ${rowNo}: specName ว่าง`);
      return;
    }
    const gussetRaw = str(row.gussetCount);
    const gussetCount = gussetRaw === "" ? 0 : Number(gussetRaw);
    if (!Number.isInteger(gussetCount) || gussetCount < 0) {
      errors.push(`Specs แถว ${rowNo} (${specName}): gussetCount ไม่ถูกต้อง (${gussetRaw})`);
      return;
    }
    const spec: ParsedMasterSpec = {
      specKey: buildSpecKey(specName, str(row.variant), str(row.thickness), gussetCount),
      specName,
      variant: str(row.variant),
      thickness: str(row.thickness),
      gussetCount,
      approxThickness: strOrNull(row.approxThickness),
      titleRaw: strOrNull(row.titleRaw),
      note: strOrNull(row.note),
      fabrics: [],
      layers: [],
    };
    if (specByKey.has(spec.specKey)) {
      errors.push(`Specs แถว ${rowNo}: specKey ซ้ำ (${spec.specKey})`);
      return;
    }
    specByKey.set(spec.specKey, spec);
  });

  fabricRows.forEach((row, i) => {
    const rowNo = i + 2;
    const specKey = str(row.specKey);
    const spec = specByKey.get(specKey);
    if (!spec) {
      errors.push(`Fabrics แถว ${rowNo}: specKey "${specKey}" ไม่มีในชีท Specs`);
      return;
    }
    const placement = str(row.placement);
    const fabricName = str(row.fabricName);
    if (!placement || !fabricName) {
      errors.push(`Fabrics แถว ${rowNo} (${specKey}): placement/fabricName ว่าง`);
      return;
    }
    const seq = Number(str(row.seq) || "0");
    if (!Number.isInteger(seq) || seq < 0) {
      errors.push(`Fabrics แถว ${rowNo} (${specKey}): seq ไม่ถูกต้อง`);
      return;
    }
    if (spec.fabrics.some((f) => f.placement === placement && f.seq === seq)) {
      errors.push(`Fabrics แถว ${rowNo} (${specKey}): placement+seq ซ้ำ (${placement}/${seq})`);
      return;
    }
    let extra: unknown | null = null;
    const extraRaw = str(row.extra);
    if (extraRaw) {
      try {
        extra = JSON.parse(extraRaw);
      } catch {
        errors.push(`Fabrics แถว ${rowNo} (${specKey}): extra ไม่ใช่ JSON ที่ถูกต้อง`);
        return;
      }
    }
    spec.fabrics.push({
      placement,
      seq,
      fabricName,
      fabricCode: strOrNull(row.fabricCode),
      waddingWeight: strOrNull(row.waddingWeight),
      foamThickness: strOrNull(row.foamThickness),
      colorNote: strOrNull(row.colorNote),
      printVisible: parseBoolCell(row.printVisible),
      extra,
    });
  });

  layerRows.forEach((row, i) => {
    const rowNo = i + 2;
    const specKey = str(row.specKey);
    const spec = specByKey.get(specKey);
    if (!spec) {
      errors.push(`Layers แถว ${rowNo}: specKey "${specKey}" ไม่มีในชีท Specs`);
      return;
    }
    const material = str(row.material);
    const layerSpec = str(row.spec);
    if (!material || !layerSpec) {
      errors.push(`Layers แถว ${rowNo} (${specKey}): material/spec ว่าง`);
      return;
    }
    const seq = Number(str(row.seq));
    if (!Number.isInteger(seq) || seq < 0) {
      errors.push(`Layers แถว ${rowNo} (${specKey}): seq ไม่ถูกต้อง`);
      return;
    }
    if (spec.layers.some((l) => l.seq === seq)) {
      errors.push(`Layers แถว ${rowNo} (${specKey}): seq ซ้ำ (${seq}) — ลำดับโครงสร้างต้องไม่ชนกัน`);
      return;
    }
    spec.layers.push({ seq, material, layerSpec, printVisible: parseBoolCell(row.printVisible) });
  });

  for (const spec of specByKey.values()) {
    if (spec.fabrics.length === 0) errors.push(`${spec.specKey}: ไม่มีผ้าเลย (ต้องมีอย่างน้อย 1)`);
    if (spec.layers.length === 0) errors.push(`${spec.specKey}: ไม่มีโครงสร้างเลย (ต้องมีอย่างน้อย 1)`);
    // ลำดับโครงสร้าง = physical order บนลงล่าง — เรียงตาม seq เสมอ ไม่พึ่งลำดับแถวในไฟล์
    spec.layers.sort((a, b) => a.seq - b.seq);
  }

  return { specs: [...specByKey.values()], errors };
}

export type HeadCandidate = { kind: "product" | "model"; id: string; name: string };

export type ValidatedMasterSpec = ParsedMasterSpec & {
  headKind: "product" | "model" | null;
  headId: string | null;
};

export type MasterSpecValidationResult = {
  specs: ValidatedMasterSpec[];
  errors: string[];
  warnings: string[];
  linkedCount: number;
  unlinkedCount: number;
};

/** ตรวจกับสภาพจริง (existing keys ใน DB, head candidates, caps จาก settings) + resolve การผูก
 * Product/ProductModel แบบ exact case-insensitive match — เจอหลายตัว = warning + unlinked
 * (ไม่เดา), ไม่เจอ = unlinked เฉยๆ (ไม่ใช่ error — Owner ผูกทีหลังผ่าน UI) */
export function validateMasterSpecs(
  specs: ParsedMasterSpec[],
  options: {
    existingSpecKeys: Set<string>;
    headCandidates: HeadCandidate[];
    maxGussetCount: number;
    maxFabricsPerPlacement: Record<string, number>;
  }
): MasterSpecValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const candidatesByName = new Map<string, HeadCandidate[]>();
  for (const c of options.headCandidates) {
    const key = c.name.trim().toLowerCase();
    if (!candidatesByName.has(key)) candidatesByName.set(key, []);
    candidatesByName.get(key)!.push(c);
  }

  const validated: ValidatedMasterSpec[] = [];
  let linkedCount = 0;

  for (const spec of specs) {
    if (options.existingSpecKeys.has(spec.specKey)) {
      errors.push(`${displayMasterSpecName(spec)}: มี Master Spec key นี้ใน DB อยู่แล้ว (${spec.specKey}) — import ซ้ำไม่ได้ ต้องแก้ผ่าน UI`);
    }
    if (spec.gussetCount > options.maxGussetCount) {
      errors.push(`${displayMasterSpecName(spec)}: กุ๊น ${spec.gussetCount} เกิน ${options.maxGussetCount} (ตั้งค่าได้ที่หน้าตั้งค่าการผลิต)`);
    }
    const countByPlacement = new Map<string, number>();
    for (const f of spec.fabrics) countByPlacement.set(f.placement, (countByPlacement.get(f.placement) ?? 0) + 1);
    for (const [placement, count] of countByPlacement) {
      const max = options.maxFabricsPerPlacement[placement] ?? 1;
      if (count > max) errors.push(`${displayMasterSpecName(spec)}: ตำแหน่งผ้า "${placement}" มี ${count} ผืน เกิน ${max}`);
    }

    const matches = candidatesByName.get(spec.specName.trim().toLowerCase()) ?? [];
    let headKind: "product" | "model" | null = null;
    let headId: string | null = null;
    if (matches.length === 1) {
      headKind = matches[0].kind;
      headId = matches[0].id;
      linkedCount += 1;
    } else if (matches.length > 1) {
      warnings.push(`${displayMasterSpecName(spec)}: ชื่อ "${spec.specName}" ตรงกับสินค้า/รุ่นในระบบ ${matches.length} ตัว — ไม่ผูกอัตโนมัติ (unlinked) ให้เลือกเองผ่าน UI`);
    }
    validated.push({ ...spec, headKind, headId });
  }

  return {
    specs: validated,
    errors,
    warnings,
    linkedCount,
    unlinkedCount: validated.length - linkedCount,
  };
}
