import { describe, expect, it } from "vitest";
import { assignFabricSeq, computeSpecHash, type FabricSpecInput, type LayerSpecInput } from "./production-spec-hash";

describe("assignFabricSeq", () => {
  it("assigns seq 0,1,2,... independently per placement group (not the whole array index)", () => {
    const result = assignFabricSeq([
      { placement: "TOP", fabricName: "a" },
      { placement: "SIDE", fabricName: "b" },
      { placement: "SIDE", fabricName: "c" },
      { placement: "BOTTOM", fabricName: "d" },
    ]);
    expect(result.map((f) => f.seq)).toEqual([0, 0, 1, 0]);
  });
});

// ตัวอย่าง Production Spec จริงจาก Owner (2026-08-28) — ใช้พิสูจน์ WHOLE, HEAD_TAIL,
// หลาย thickness ในรุ่นเดียวกัน, และผ้าหลายผืนใน placement เดียวกัน

const vanessaFabrics: FabricSpecInput[] = [
  { placement: "TOP", seq: 0, fabricName: "กำมะหยี่สีเทา", waddingWeight: "280g", foamThickness: "10mm" },
  { placement: "HEAD_TAIL", seq: 0, fabricName: "กำมะหยี่สีเทา", waddingWeight: "280g", foamThickness: "10mm" },
  { placement: "BOTTOM", seq: 0, fabricName: "กำมะหยี่สีเทา", waddingWeight: "200g", foamThickness: "3mm" },
];
const vanessaLayers: LayerSpecInput[] = [
  { seq: 0, material: "Memory Foam อัด ES-1", spec: "1\"" },
  { seq: 1, material: "PE", spec: "15mm" },
  { seq: 2, material: "ใยเฟลว", spec: "550g (5.5mm)" },
  { seq: 3, material: "Pocket Spring", spec: "8\"" },
  { seq: 4, material: "ใยเฟลว", spec: "550g (5.5mm)" },
  { seq: 5, material: "PE", spec: "10mm" },
];

const boxSpringFabrics: FabricSpecInput[] = [
  { placement: "WHOLE", seq: 0, fabricName: "ผ้าริ้วเทา", waddingWeight: "118g", fabricCode: "CD16#", colorNote: "หรือ PVC ตามสีที่เลือก" },
];
const boxSpringLayers: LayerSpecInput[] = [
  { seq: 0, material: "TS-11", spec: "0.25\"" },
  { seq: 1, material: "ใยเฟลว", spec: "550g" },
  { seq: 2, material: "Spring", spec: "2.3mm 32 แถว (~7\")" },
  { seq: 3, material: "MDF", spec: "6mm" },
  { seq: 4, material: "โครงไม้จ๊อย", spec: "1x2 สูง 2\"" },
];

const luxury8Layers: LayerSpecInput[] = [
  { seq: 0, material: "CMHR-1", spec: "2\"" },
  { seq: 1, material: "PE", spec: "95mm" },
  { seq: 2, material: "CBF", spec: "1.5\"" },
];
const luxury6Layers: LayerSpecInput[] = [
  { seq: 0, material: "CMHR-1", spec: "1\"" },
  { seq: 1, material: "CBF", spec: "0.5\"" },
  { seq: 2, material: "PE", spec: "75mm" },
  { seq: 3, material: "CBF", spec: "0.75\"" },
];

const charlotteFabrics: FabricSpecInput[] = [
  { placement: "TOP", seq: 0, fabricName: "กำมะหยี่สีเทา", waddingWeight: "300g", foamThickness: "13mm" },
  { placement: "HEAD_TAIL", seq: 0, fabricName: "กำมะหยี่สีเทา", waddingWeight: "300g", foamThickness: "13mm" },
  { placement: "BOTTOM", seq: 0, fabricName: "กำมะหยี่สีเทา", waddingWeight: "300g", foamThickness: "13mm" },
];
const charlotteLayers: LayerSpecInput[] = [
  { seq: 0, material: "ยางพารา", spec: "1cm" },
  { seq: 1, material: "CMHR-1", spec: "2\"" },
  { seq: 2, material: "CBF", spec: "5\"" },
  { seq: 3, material: "PE", spec: "30mm" },
];

describe("computeSpecHash — ตัวอย่างจริงจาก Owner", () => {
  it("Vanessa: HEAD_TAIL แยกจาก TOP/BOTTOM ได้ ไม่ทับกัน", () => {
    const hash = computeSpecHash({ productFamilyKey: "model:p-vanessa", gussetCount: 1, thickness: "8", fabrics: vanessaFabrics, layers: vanessaLayers });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("Box Spring: WHOLE ต่างจากการไม่มี fabric เลย (placement ว่าง)", () => {
    const withWhole = computeSpecHash({ productFamilyKey: "model:p-boxspring", gussetCount: null, thickness: null, fabrics: boxSpringFabrics, layers: boxSpringLayers });
    const withoutFabric = computeSpecHash({ productFamilyKey: "model:p-boxspring", gussetCount: null, thickness: null, fabrics: [], layers: boxSpringLayers });
    expect(withWhole).not.toBe(withoutFabric);
  });

  it("Luxury 6\" กับ 8\": รุ่นเดียวกัน (productId เดียวกัน) แต่ thickness+layers ต่างกัน ต้องได้ specHash คนละค่า", () => {
    const luxury8 = computeSpecHash({ productFamilyKey: "model:p-luxury", gussetCount: 2, thickness: "8", fabrics: [], layers: luxury8Layers });
    const luxury6 = computeSpecHash({ productFamilyKey: "model:p-luxury", gussetCount: 2, thickness: "6", fabrics: [], layers: luxury6Layers });
    expect(luxury8).not.toBe(luxury6);
  });

  it("Charlotte: เปลี่ยน gussetCount เท่านั้น (spec อื่นเหมือนเดิม) ต้องได้ specHash คนละค่า", () => {
    const gusset1 = computeSpecHash({ productFamilyKey: "model:p-charlotte", gussetCount: 1, thickness: "8", fabrics: charlotteFabrics, layers: charlotteLayers });
    const gusset2 = computeSpecHash({ productFamilyKey: "model:p-charlotte", gussetCount: 2, thickness: "8", fabrics: charlotteFabrics, layers: charlotteLayers });
    expect(gusset1).not.toBe(gusset2);
  });

  it("ผ้าปีก 2 ผืนใน placement เดียวกัน (ต่าง seq) ให้ hash ต่างจากมีผืนเดียว", () => {
    const oneWing: FabricSpecInput[] = [{ placement: "SIDE", seq: 0, fabricName: "JQ หนานุ่มสีเทา", waddingWeight: "150g", foamThickness: "10mm" }];
    const twoWings: FabricSpecInput[] = [
      ...oneWing,
      { placement: "SIDE", seq: 1, fabricName: "JQ หนานุ่มสีขาว", waddingWeight: "150g", foamThickness: "10mm" },
    ];
    const hashOne = computeSpecHash({ productFamilyKey: "model:p-pocketspring", gussetCount: 1, thickness: null, fabrics: oneWing, layers: [] });
    const hashTwo = computeSpecHash({ productFamilyKey: "model:p-pocketspring", gussetCount: 1, thickness: null, fabrics: twoWings, layers: [] });
    expect(hashOne).not.toBe(hashTwo);
  });

  it("ผ้าปีก 2 ผืนที่สลับลำดับกัน (seq 0/1 สลับกัน) ให้ hash ต่างกัน — ลำดับผ้าปีกมีความหมายจริง ไม่ใช่ arbitrary", () => {
    const grayFirst: FabricSpecInput[] = [
      { placement: "SIDE", seq: 0, fabricName: "JQ หนานุ่มสีเทา" },
      { placement: "SIDE", seq: 1, fabricName: "JQ หนานุ่มสีขาว" },
    ];
    const whiteFirst: FabricSpecInput[] = [
      { placement: "SIDE", seq: 0, fabricName: "JQ หนานุ่มสีขาว" },
      { placement: "SIDE", seq: 1, fabricName: "JQ หนานุ่มสีเทา" },
    ];
    const hashGrayFirst = computeSpecHash({ productFamilyKey: "model:p-pocketspring", gussetCount: 1, thickness: null, fabrics: grayFirst, layers: [] });
    const hashWhiteFirst = computeSpecHash({ productFamilyKey: "model:p-pocketspring", gussetCount: 1, thickness: null, fabrics: whiteFirst, layers: [] });
    expect(hashGrayFirst).not.toBe(hashWhiteFirst);
  });

  it("deterministic: ลำดับ fabrics/layers ที่ต่างกันตอนกรอก (แต่ placement+seq เดิม) ให้ hash เท่ากัน", () => {
    const inOrder = computeSpecHash({ productFamilyKey: "model:p-vanessa", gussetCount: 1, thickness: "8", fabrics: vanessaFabrics, layers: vanessaLayers });
    const shuffledFabrics = [vanessaFabrics[2], vanessaFabrics[0], vanessaFabrics[1]];
    const shuffledLayers = [...vanessaLayers].reverse();
    const outOfOrder = computeSpecHash({ productFamilyKey: "model:p-vanessa", gussetCount: 1, thickness: "8", fabrics: shuffledFabrics, layers: shuffledLayers });
    expect(inOrder).toBe(outOfOrder);
  });

  it("displayOverride ไม่กระทบ hash", () => {
    const withoutOverride = computeSpecHash({ productFamilyKey: "model:p-vanessa", gussetCount: 1, thickness: "8", fabrics: vanessaFabrics, layers: vanessaLayers });
    const withOverride = computeSpecHash({
      productFamilyKey: "model:p-vanessa",
      gussetCount: 1,
      thickness: "8",
      fabrics: vanessaFabrics.map((f) => ({ ...f, displayOverride: "ข้อความพิมพ์ทับ" } as FabricSpecInput)),
      layers: vanessaLayers,
    });
    expect(withoutOverride).toBe(withOverride);
  });

  it("productFamilyKey ต่างกัน (คนละรุ่น) แม้สเปกอื่นเหมือนกันเป๊ะ ต้องได้ specHash คนละค่า", () => {
    const a = computeSpecHash({ productFamilyKey: "model:p-a", gussetCount: 1, thickness: "8", fabrics: [], layers: [] });
    const b = computeSpecHash({ productFamilyKey: "model:p-b", gussetCount: 1, thickness: "8", fabrics: [], layers: [] });
    expect(a).not.toBe(b);
  });

  // Owner ถามก่อน commit (2026-08-28) — ต่างไซส์ของรุ่นเดียวกันเป็นคนละแถว Product (คนละ
  // id) แต่ resolveAccessHead() (product-company-access.ts) resolve ทั้งคู่ไปที่ modelId
  // เดียวกัน ผู้เรียก (createProductionOrder) ต้อง resolve ก่อนแล้วส่ง `${kind}:${id}` เข้ามา
  // — พิสูจน์ตรงนี้ว่า "รุ่นเดียวกัน คนละไซส์ สเปกเดียวกันจริง" ต้องได้ specHash เท่ากัน
  it("รุ่นเดียวกัน (resolve ผ่าน resolveAccessHead ได้ family key เดียวกัน) ต่างไซส์ แต่ gusset/thickness/fabric/layers เหมือนกัน → specHash เดียวกัน", () => {
    // จำลอง Product 2 แถว (id ต่างกัน สื่อถึงคนละไซส์) แต่ resolveAccessHead ให้ผลเดียวกัน
    // เพราะ modelId เดียวกัน (Vanessa 3ft กับ Vanessa 6ft ผูก ProductModel "Vanessa" เดียวกัน)
    const sameFamilyKeyFromSize3ft = "model:vanessa-model-id";
    const sameFamilyKeyFromSize6ft = "model:vanessa-model-id";
    const hash3ft = computeSpecHash({ productFamilyKey: sameFamilyKeyFromSize3ft, gussetCount: 1, thickness: "8", fabrics: vanessaFabrics, layers: vanessaLayers });
    const hash6ft = computeSpecHash({ productFamilyKey: sameFamilyKeyFromSize6ft, gussetCount: 1, thickness: "8", fabrics: vanessaFabrics, layers: vanessaLayers });
    expect(hash3ft).toBe(hash6ft);
  });

  it("รุ่นเดียวกันแต่สเปกจริงต่างกัน (เช่น thickness ต่างไซส์คนละความหนา) ยัง specHash ต่างกันได้ตามจริง แม้ family key เดียวกัน", () => {
    const thick8 = computeSpecHash({ productFamilyKey: "model:vanessa-model-id", gussetCount: 1, thickness: "8", fabrics: vanessaFabrics, layers: vanessaLayers });
    const thick6 = computeSpecHash({ productFamilyKey: "model:vanessa-model-id", gussetCount: 1, thickness: "6", fabrics: vanessaFabrics, layers: vanessaLayers });
    expect(thick8).not.toBe(thick6);
  });
});
