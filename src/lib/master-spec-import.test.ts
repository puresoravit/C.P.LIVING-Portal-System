import { describe, expect, it } from "vitest";
import {
  buildSpecKey,
  displayMasterSpecName,
  parseMasterSpecSheets,
  validateMasterSpecs,
  type RawSheetRow,
} from "./master-spec-import";

// Fixtures สังเคราะห์ขนาดเล็ก (ไม่ใช่ Master Data จริง) — ทดสอบกลไก parse/validate เท่านั้น

function specRow(overrides: RawSheetRow = {}): RawSheetRow {
  return { specName: "TestModel", variant: "", thickness: "", gussetCount: "2", approxThickness: "9", titleRaw: "", note: "", ...overrides };
}
const KEY = buildSpecKey("TestModel", "", "", 2);
function fabricRow(overrides: RawSheetRow = {}): RawSheetRow {
  return { specKey: KEY, placement: "TOP", seq: "0", fabricName: "ผ้าทดสอบ", fabricCode: "", waddingWeight: "", foamThickness: "", colorNote: "", extra: "", printVisible: "TRUE", ...overrides };
}
function layerRow(overrides: RawSheetRow = {}): RawSheetRow {
  return { specKey: KEY, seq: "0", material: "PE", spec: "15mm", printVisible: "TRUE", ...overrides };
}

describe("displayMasterSpecName", () => {
  it("แสดงกุ๊นเมื่อ > 0 เท่านั้น (ไม่แสดง '0 กุ๊น')", () => {
    expect(displayMasterSpecName({ specName: "Cerina", variant: "", thickness: "", gussetCount: 4 })).toBe("Cerina — 4 กุ๊น");
    expect(displayMasterSpecName({ specName: "Aston", variant: "", thickness: "6", gussetCount: 0 })).toBe('Aston 6"');
    expect(displayMasterSpecName({ specName: "Falcon", variant: "PVC", thickness: "8", gussetCount: 2 })).toBe('Falcon (PVC) 8" — 2 กุ๊น');
  });
});

describe("parseMasterSpecSheets", () => {
  it("ประกอบ 3 ชีทเป็น spec เต็มได้", () => {
    const { specs, errors } = parseMasterSpecSheets([specRow()], [fabricRow()], [layerRow(), layerRow({ seq: "1", material: "CBF", spec: "5\"" })]);
    expect(errors).toEqual([]);
    expect(specs).toHaveLength(1);
    expect(specs[0].fabrics).toHaveLength(1);
    expect(specs[0].layers.map((l) => l.material)).toEqual(["PE", "CBF"]);
  });

  it("fabric/layer ที่ชี้ specKey ไม่มีจริง = error (cross-reference)", () => {
    const { errors } = parseMasterSpecSheets([specRow()], [fabricRow({ specKey: "ไม่มีจริง|x|y|1" })], [layerRow()]);
    expect(errors.some((e) => e.includes("ไม่มีในชีท Specs"))).toBe(true);
  });

  it("spec ที่ไม่มีผ้าหรือไม่มีโครงสร้าง = error", () => {
    const { errors } = parseMasterSpecSheets([specRow()], [], []);
    expect(errors.some((e) => e.includes("ไม่มีผ้าเลย"))).toBe(true);
    expect(errors.some((e) => e.includes("ไม่มีโครงสร้างเลย"))).toBe(true);
  });

  it("specKey ซ้ำในชีท Specs = error", () => {
    const { errors } = parseMasterSpecSheets([specRow(), specRow()], [fabricRow()], [layerRow()]);
    expect(errors.some((e) => e.includes("specKey ซ้ำ"))).toBe(true);
  });

  it("placement+seq ซ้ำใน spec เดียวกัน = error", () => {
    const { errors } = parseMasterSpecSheets([specRow()], [fabricRow(), fabricRow()], [layerRow()]);
    expect(errors.some((e) => e.includes("placement+seq ซ้ำ"))).toBe(true);
  });

  it("layer seq ซ้ำ = error (ลำดับโครงสร้างต้องไม่ชนกัน)", () => {
    const { errors } = parseMasterSpecSheets([specRow()], [fabricRow()], [layerRow(), layerRow()]);
    expect(errors.some((e) => e.includes("seq ซ้ำ"))).toBe(true);
  });

  it("เรียง layer ตาม seq เสมอ ไม่พึ่งลำดับแถวในไฟล์ (ลำดับ = โครงสร้างจริงบนลงล่าง)", () => {
    const { specs } = parseMasterSpecSheets(
      [specRow()],
      [fabricRow()],
      [layerRow({ seq: "1", material: "CBF" }), layerRow({ seq: "0", material: "PE" })]
    );
    expect(specs[0].layers.map((l) => l.material)).toEqual(["PE", "CBF"]);
  });

  it("gussetCount ว่าง = 0 (sentinel ไม่มีกุ๊น) ไม่ใช่ error", () => {
    const key0 = buildSpecKey("ZipModel", "", "", 0);
    const { specs, errors } = parseMasterSpecSheets(
      [specRow({ specName: "ZipModel", gussetCount: "" })],
      [fabricRow({ specKey: key0 })],
      [layerRow({ specKey: key0 })]
    );
    expect(errors).toEqual([]);
    expect(specs[0].gussetCount).toBe(0);
  });

  it("printVisible FALSE ถูกอ่านเป็น false (แถวยังอยู่ครบใน canonical)", () => {
    const { specs } = parseMasterSpecSheets([specRow()], [fabricRow({ printVisible: "FALSE" })], [layerRow({ printVisible: "FALSE" })]);
    expect(specs[0].fabrics[0].printVisible).toBe(false);
    expect(specs[0].layers[0].printVisible).toBe(false);
    expect(specs[0].fabrics[0].fabricName).toBe("ผ้าทดสอบ");
  });
});

describe("validateMasterSpecs", () => {
  const baseOptions = {
    existingSpecKeys: new Set<string>(),
    headCandidates: [],
    maxGussetCount: 4,
    maxFabricsPerPlacement: { WING: 2, SIDE: 2 },
  };
  function parsedSpec(overrides = {}) {
    const { specs } = parseMasterSpecSheets([specRow()], [fabricRow()], [layerRow()]);
    return { ...specs[0], ...overrides };
  }

  it("key ที่มีใน DB อยู่แล้ว = error (import ซ้ำไม่ได้)", () => {
    const result = validateMasterSpecs([parsedSpec()], { ...baseOptions, existingSpecKeys: new Set([KEY]) });
    expect(result.errors.some((e) => e.includes("อยู่แล้ว"))).toBe(true);
  });

  it("เกิน placement cap = error, ภายใน cap (SIDE 2 ผ้า) = ผ่าน", () => {
    const twoSide = parsedSpec({
      fabrics: [
        { placement: "SIDE", seq: 0, fabricName: "a", fabricCode: null, waddingWeight: null, foamThickness: null, colorNote: null, printVisible: true, extra: null },
        { placement: "SIDE", seq: 1, fabricName: "b", fabricCode: null, waddingWeight: null, foamThickness: null, colorNote: null, printVisible: true, extra: null },
      ],
    });
    expect(validateMasterSpecs([twoSide], baseOptions).errors).toEqual([]);
    const twoTop = parsedSpec({
      fabrics: [
        { placement: "TOP", seq: 0, fabricName: "a", fabricCode: null, waddingWeight: null, foamThickness: null, colorNote: null, printVisible: true, extra: null },
        { placement: "TOP", seq: 1, fabricName: "b", fabricCode: null, waddingWeight: null, foamThickness: null, colorNote: null, printVisible: true, extra: null },
      ],
    });
    expect(validateMasterSpecs([twoTop], baseOptions).errors.some((e) => e.includes("TOP"))).toBe(true);
  });

  it("ผูก head แบบ exact case-insensitive — เจอตัวเดียวผูกให้, ไม่เจอ = unlinked ไม่ใช่ error", () => {
    const result = validateMasterSpecs([parsedSpec()], {
      ...baseOptions,
      headCandidates: [{ kind: "product", id: "p1", name: "testmodel" }],
    });
    expect(result.errors).toEqual([]);
    expect(result.specs[0].headKind).toBe("product");
    expect(result.specs[0].headId).toBe("p1");
    expect(result.linkedCount).toBe(1);

    const none = validateMasterSpecs([parsedSpec()], baseOptions);
    expect(none.errors).toEqual([]);
    expect(none.specs[0].headId).toBeNull();
    expect(none.unlinkedCount).toBe(1);
  });

  it("ชื่อชนหลายตัว = warning + unlinked (ไม่เดา ไม่สร้าง Product Master)", () => {
    const result = validateMasterSpecs([parsedSpec()], {
      ...baseOptions,
      headCandidates: [
        { kind: "product", id: "p1", name: "TestModel" },
        { kind: "model", id: "m1", name: "testmodel" },
      ],
    });
    expect(result.warnings.some((w) => w.includes("ไม่ผูกอัตโนมัติ"))).toBe(true);
    expect(result.specs[0].headId).toBeNull();
  });
});
