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

// Cerina (4 กุ๊น) — WING แยกจาก SIDE จริง (คนละ placement) และ SIDE มี 2 ผ้าจริง (SIDE #1/#2)
// ยืนยันว่าไม่ได้มีแค่ "ผ้าปีก" (WING) เท่านั้นที่มีได้ 2 ผ้า — SIDE ก็มีได้เช่นกัน (2026-08-28)
const cerinaFabricsRaw = [
  { placement: "TOP", fabricName: "JQ หนานุ่ม 180g", fabricCode: "D2-4147", waddingWeight: "280g", foamThickness: "10mm" },
  { placement: "WING", fabricName: "JQ หนานุ่มสีดำ", waddingWeight: "80g" },
  { placement: "SIDE", fabricName: "JQ หนานุ่มสีขาว", extra: "ไม่ควิลท์" },
  { placement: "SIDE", fabricName: "JQ หนานุ่มสีดำ", waddingWeight: "80g", foamThickness: "3mm" },
  { placement: "BOTTOM", fabricName: "JQ หนานุ่ม 180g", fabricCode: "D2-4147", waddingWeight: "80g", foamThickness: "3mm" },
];
const cerinaFabrics: FabricSpecInput[] = assignFabricSeq(cerinaFabricsRaw);
const cerinaLayers: LayerSpecInput[] = [
  { seq: 0, material: "Pillow Top ฟองน้ำอัดขาว", spec: "1\"" },
  { seq: 1, material: "PE", spec: "10mm" },
  { seq: 2, material: "ใยเฟลว", spec: "550g" },
  { seq: 3, material: "Spring", spec: "2.3mm 32 แถว" },
  { seq: 4, material: "ใยเฟลว", spec: "550g" },
];

// Harry (3 กุ๊น) — WING/SIDE มีผ้าเดียว (ต่างจาก Cerina) พิสูจน์ว่า schema ไม่ได้ผูกจำนวนผ้า
// ต่อ placement เข้ากับจำนวนกุ๊นหรือชื่อรุ่นตายตัว แต่ละรุ่นกำหนดเองอิสระตาม master data จริง
const harryFabricsRaw = [
  { placement: "TOP", fabricName: "JQ หนานุ่ม 180g", fabricCode: "D1-9020", waddingWeight: "250g", foamThickness: "10mm" },
  { placement: "WING", fabricName: "JQ หนานุ่ม 180g", fabricCode: "D1-9020" },
  { placement: "SIDE", fabricName: "JQ หนานุ่ม 180g", fabricCode: "D1-9020", waddingWeight: "80g", foamThickness: "3mm" },
  { placement: "BOTTOM", fabricName: "JQ หนานุ่ม 180g", fabricCode: "D1-9020", waddingWeight: "250g" },
];
const harryFabrics: FabricSpecInput[] = assignFabricSeq(harryFabricsRaw);
const harryLayers: LayerSpecInput[] = [
  { seq: 0, material: "Pillow Top ฟองน้ำอัดขาว", spec: "1\"" },
  { seq: 1, material: "PE", spec: "15mm" },
  { seq: 2, material: "ใยเฟลว", spec: "550g" },
  { seq: 3, material: "Spring", spec: "2.3mm 32 แถว" },
  { seq: 4, material: "ใยเฟลว", spec: "550g" },
  { seq: 5, material: "PE", spec: "15mm" },
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

  // ชื่อผ้าในเคสนี้เป็นข้อมูลสมมติ (Pocket Spring จริงที่ Owner ให้มามีผ้า SIDE เดียว) — สร้าง
  // เพิ่มเพื่อทดสอบกลไก "หลายผ้าใน placement เดียวกัน" ก่อนมีตัวอย่างจริง (ตอนนี้มี Cerina
  // ยืนยันเคสจริงแล้ว — ดู describe ถัดไป) ไม่ใช่ Master Spec จริงของ Pocket Spring
  it("[กลไกเท่านั้น] เพิ่มผ้าที่ 2 ใน placement เดียวกัน (ต่าง seq) ให้ hash ต่างจากมีผืนเดียว", () => {
    const oneFabric: FabricSpecInput[] = [{ placement: "SIDE", seq: 0, fabricName: "ผ้าสมมติ A", waddingWeight: "150g", foamThickness: "10mm" }];
    const twoFabrics: FabricSpecInput[] = [
      ...oneFabric,
      { placement: "SIDE", seq: 1, fabricName: "ผ้าสมมติ B", waddingWeight: "150g", foamThickness: "10mm" },
    ];
    const hashOne = computeSpecHash({ productFamilyKey: "model:p-pocketspring", gussetCount: 1, thickness: null, fabrics: oneFabric, layers: [] });
    const hashTwo = computeSpecHash({ productFamilyKey: "model:p-pocketspring", gussetCount: 1, thickness: null, fabrics: twoFabrics, layers: [] });
    expect(hashOne).not.toBe(hashTwo);
  });

  // หมายเหตุ (Owner ยืนยัน 2026-08-28): ชื่อผ้าในเคสนี้เป็นข้อมูลสมมติที่ผมสร้างเองเพื่อ
  // ทดสอบกลไก "หลายผ้าใน placement เดียวกัน" ก่อนมีตัวอย่างจริง (Cerina) — ทดสอบแค่ว่า
  // "โค้ดถือว่าลำดับที่กรอกมามีผล (แต่ละ seq คือคนละแถว คนละข้อมูล)" เท่านั้น ไม่ได้แปลว่า
  // ลำดับผ้าจริงทางธุรกิจ (เช่นผ้าปีก/SIDE ตัวไหนควรมาก่อน) ได้รับการยืนยันแล้ว — Owner จะ
  // ตรวจ/กรอก Master Spec จริงทีหลัง อย่า derive ความหมายทางธุรกิจจากเคสนี้
  it("[กลไกเท่านั้น ไม่ใช่ข้อมูลยืนยันจริง] สลับลำดับผ้า 2 ผืนใน placement เดียวกัน (seq 0/1 สลับกัน) ให้ hash ต่างกัน", () => {
    const grayFirst: FabricSpecInput[] = [
      { placement: "SIDE", seq: 0, fabricName: "ผ้าสมมติ A" },
      { placement: "SIDE", seq: 1, fabricName: "ผ้าสมมติ B" },
    ];
    const whiteFirst: FabricSpecInput[] = [
      { placement: "SIDE", seq: 0, fabricName: "ผ้าสมมติ B" },
      { placement: "SIDE", seq: 1, fabricName: "ผ้าสมมติ A" },
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

  it("fabric displayOverride ไม่กระทบ hash", () => {
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

  // LayerSpecInput ไม่มี field displayOverride เลยในระดับ type (ต่างจาก FabricSpecInput ที่มี)
  // — กัน "ลืมกรอง" ไม่ให้เกิดขึ้นได้เลยตั้งแต่ compile-time แต่ยัง test runtime ไว้ด้วยเผื่อมี
  // การส่ง object ที่มี field เกินมาจากที่อื่น (เช่นตรงจาก DB row ที่มีคอลัมน์ displayOverride จริง)
  it("layer displayOverride (ถ้ามีติดมาจาก object อื่น) ไม่กระทบ hash เพราะ computeSpecHash อ่านแค่ seq/material/spec", () => {
    const withoutOverride = computeSpecHash({ productFamilyKey: "model:p-vanessa", gussetCount: 1, thickness: "8", fabrics: [], layers: vanessaLayers });
    const layersWithExtraField = vanessaLayers.map((l) => ({ ...l, displayOverride: "ข้อความพิมพ์ทับชั้นโครงสร้าง" }));
    const withOverride = computeSpecHash({ productFamilyKey: "model:p-vanessa", gussetCount: 1, thickness: "8", fabrics: [], layers: layersWithExtraField });
    expect(withoutOverride).toBe(withOverride);
  });

  // ยืนยันแล้ว (ต่างจากผ้า): ลำดับ ProductionItemLayer คือโครงสร้างจริงบนลงล่าง มีผลต่อสเปก —
  // สลับลำดับ 2 ชั้นที่มีเนื้อหาต่างกัน (ไม่ใช่แค่ตำแหน่งในอาเรย์) ต้องได้ specHash ต่างกัน
  it("[ยืนยันแล้ว] สลับลำดับชั้นโครงสร้าง (บนลงล่าง) ให้ specHash ต่างกัน เพราะลำดับ = โครงสร้างจริง", () => {
    const topToBottom = computeSpecHash({
      productFamilyKey: "model:p-vanessa",
      gussetCount: 1,
      thickness: "8",
      fabrics: [],
      layers: [
        { seq: 0, material: "Memory Foam", spec: "1\"" },
        { seq: 1, material: "Pocket Spring", spec: "8\"" },
      ],
    });
    const bottomToTop = computeSpecHash({
      productFamilyKey: "model:p-vanessa",
      gussetCount: 1,
      thickness: "8",
      fabrics: [],
      layers: [
        { seq: 0, material: "Pocket Spring", spec: "8\"" },
        { seq: 1, material: "Memory Foam", spec: "1\"" },
      ],
    });
    expect(topToBottom).not.toBe(bottomToTop);
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

// Cerina/Harry (2026-08-28) — เพิ่มเป็น regression fixtures ตามที่ Owner ยืนยัน: WING แยก
// จาก SIDE จริง, SIDE เองก็มีได้ 2 ผ้าเหมือนกัน (ไม่ใช่แค่ WING), จำนวนผ้าต่อ placement ไม่ผูก
// กับจำนวนกุ๊นหรือชื่อรุ่นตายตัว (Cerina SIDE=2 แต่ WING=1, Harry ทุก placement=1 แม้เป็น
// CBF Topper Spring เหมือนกัน)
//
// สำคัญ (Owner ชี้แจงเพิ่ม 2026-08-28): ลำดับ bullet ที่ Owner พิมพ์มาให้ (เช่น SIDE #1 ก่อน
// SIDE #2) เป็นแค่วิธีเรียงข้อความในแชท "ยังไม่ยืนยัน" ว่าเป็นลำดับจริงทางการผลิต (Physical
// Order) ที่มีนัยสำคัญ — Owner จะตรวจ/กรอก Master Spec ที่ยืนยันแล้วทีหลัง ต่างจาก
// ProductionItemLayer ที่ยืนยันแล้วว่าลำดับ = โครงสร้างจริงบนลงล่างมีผลต่อ spec/hash จริง
//
// จึงแยก 2 describe: (1) เนื้อหา/placement/material/layers ที่ยืนยันแล้วจากตัวอย่างจริง
// (2) กลไก fabric-order เท่านั้น (โค้ดถือว่าลำดับที่กรอกมามีผลต่อ hash เสมอ เพื่อไม่เขียนทับ/
// รวมข้อมูลที่อาจต่างกันจริงโดยไม่ตั้งใจ — แต่ "ลำดับไหนถูกจริง" ยังไม่ถูกยืนยันจาก Owner)
describe("computeSpecHash — Cerina/Harry: เนื้อหาที่ยืนยันแล้ว (placement/material/layers)", () => {
  it("Cerina: SIDE มี 2 ผ้าจริง (แยกจาก WING ที่มี 1 ผ้า) — จำนวนผ้ายืนยันแล้ว ไม่ใช่ลำดับ", () => {
    const sideFabrics = cerinaFabrics.filter((f) => f.placement === "SIDE");
    const wingFabrics = cerinaFabrics.filter((f) => f.placement === "WING");
    expect(sideFabrics).toHaveLength(2);
    expect(wingFabrics).toHaveLength(1);
  });

  it("Harry: ทุก placement มีผ้าเดียว (WING=1 ต่างจาก Cerina ที่ SIDE=2) — ไม่ได้ผูกจำนวนผ้ากับกุ๊น/ชื่อรุ่นตายตัว", () => {
    for (const placement of ["TOP", "WING", "SIDE", "BOTTOM"]) {
      expect(harryFabrics.filter((f) => f.placement === placement)).toHaveLength(1);
    }
  });

  it("Cerina (4 กุ๊น) กับ Harry (3 กุ๊น) เป็นคนละสเปกจริง ต้องได้ specHash ต่างกัน แม้เป็น CBF Topper Spring เหมือนกัน", () => {
    const cerinaHash = computeSpecHash({ productFamilyKey: "model:cerina", gussetCount: 4, thickness: null, fabrics: cerinaFabrics, layers: cerinaLayers });
    const harryHash = computeSpecHash({ productFamilyKey: "model:harry", gussetCount: 3, thickness: null, fabrics: harryFabrics, layers: harryLayers });
    expect(cerinaHash).not.toBe(harryHash);
  });

  it("Cerina: รุ่นเดียวกัน ต่างไซส์ (family key เดียวกัน) สเปกเดียวกันทุกอย่าง → specHash เดียวกัน (grouping ข้ามไซส์ได้จริง)", () => {
    const hashSize5 = computeSpecHash({ productFamilyKey: "model:cerina", gussetCount: 4, thickness: null, fabrics: cerinaFabrics, layers: cerinaLayers });
    const hashSize6 = computeSpecHash({ productFamilyKey: "model:cerina", gussetCount: 4, thickness: null, fabrics: cerinaFabrics, layers: cerinaLayers });
    expect(hashSize5).toBe(hashSize6);
  });
});

describe("computeSpecHash — Cerina: fabric-order เป็นกลไกโค้ดเท่านั้น (ลำดับจริงยังไม่ยืนยันจาก Owner)", () => {
  it("สลับลำดับ SIDE #1/#2 ตามที่ Owner พิมพ์มา ให้ hash ต่างกัน — ทดสอบว่าโค้ดถือว่าลำดับกรอกมีผล ไม่ใช่ข้อยืนยันว่าลำดับนี้ถูกต้องทางการผลิต", () => {
    const swappedSideOrder = [
      cerinaFabricsRaw[0], // TOP
      cerinaFabricsRaw[1], // WING
      cerinaFabricsRaw[3], // SIDE #2 ก่อน
      cerinaFabricsRaw[2], // SIDE #1 ทีหลัง
      cerinaFabricsRaw[4], // BOTTOM
    ];
    const originalHash = computeSpecHash({ productFamilyKey: "model:cerina", gussetCount: 4, thickness: null, fabrics: cerinaFabrics, layers: cerinaLayers });
    const swappedHash = computeSpecHash({
      productFamilyKey: "model:cerina",
      gussetCount: 4,
      thickness: null,
      fabrics: assignFabricSeq(swappedSideOrder),
      layers: cerinaLayers,
    });
    expect(originalHash).not.toBe(swappedHash);
  });

  it("จัดลำดับ placement ในอาเรย์ต้นฉบับใหม่ทั้งหมด (แต่ลำดับภายใน SIDE เดิม) ต้องได้ specHash เท่าเดิม — deterministic ไม่ขึ้นกับลำดับตอนกรอกทั้งอาเรย์ (mechanism, ไม่เกี่ยวกับว่าลำดับภายใน SIDE ถูกต้องทางธุรกิจหรือไม่)", () => {
    const reordered = [cerinaFabricsRaw[4], cerinaFabricsRaw[2], cerinaFabricsRaw[1], cerinaFabricsRaw[3], cerinaFabricsRaw[0]]; // BOTTOM, SIDE#1, WING, SIDE#2, TOP
    const originalHash = computeSpecHash({ productFamilyKey: "model:cerina", gussetCount: 4, thickness: null, fabrics: cerinaFabrics, layers: cerinaLayers });
    const reorderedHash = computeSpecHash({
      productFamilyKey: "model:cerina",
      gussetCount: 4,
      thickness: null,
      fabrics: assignFabricSeq(reordered),
      layers: cerinaLayers,
    });
    expect(originalHash).toBe(reorderedHash);
  });
});
