import { createHash } from "crypto";

// S3 CP1 — spec_hash ต้องสะท้อนสูตรการผลิตจริง: รุ่น+กุ๊น+ความหนา+ผ้าตามตำแหน่งจริง(ไม่ตายตัว
// 3 ตำแหน่ง)+ทุกชั้นโครงสร้าง เรียงลำดับ deterministic (placement แล้วตาม seq สำหรับผ้า, seq
// สำหรับชั้น) ไม่ขึ้นกับลำดับที่ผู้ใช้กรอก/ลำดับแถวใน DB — ไซส์/qty/displayOverride ไม่เข้า
// hash (ดู CLAUDE.md ข้อ 1) เพราะสูตรเดียวกันใช้ข้ามไซส์ได้ และ override เป็นแค่การแสดงผล
//
// "รุ่น" = productFamilyKey ไม่ใช่ Product.id ตรงๆ (แก้ 2026-08-28 หลัง Owner ถามก่อน commit):
// ต่างไซส์ของรุ่นเดียวกันเป็นคนละแถว Product ที่มี id ต่างกัน (Product.size + Product.modelId
// ผูก ProductModel เดียวกัน — ดู schema.prisma) ถ้าใช้ Product.id ตรงๆ จะจัดกลุ่มข้ามไซส์
// ไม่ได้เลย ทั้งที่ตั้งใจให้สูตรเดียวกันใช้ข้ามไซส์ได้ — ผู้เรียกต้อง resolve ผ่าน
// resolveAccessHead() (product-company-access.ts) มาก่อนแล้วส่ง `${head.kind}:${head.id}`
// เข้ามา (reuse Family Head XOR เดิม ไม่ใช่ familyId ใหม่ — ตรงกับ comment ที่ schema.prisma
// "ตระกูลสินค้าของ Production reuse modelId/parentProductId เดิม")
//
// ใช้ tuple array (ไม่ใช่ object key/value) ในการ serialize เพื่อเลี่ยงปัญหาลำดับ key ของ
// JSON.stringify บน object ที่ไม่รับประกัน

export type FabricSpecInput = {
  placement: string;
  seq: number;
  fabricName: string;
  fabricCode?: string | null;
  waddingWeight?: string | null;
  foamThickness?: string | null;
  colorNote?: string | null;
  extra?: unknown;
};

export type LayerSpecInput = {
  seq: number;
  material: string;
  spec: string;
};

export type ProductionSpecInput = {
  /** ผลลัพธ์จาก resolveAccessHead() แปลงเป็น `${kind}:${id}` แล้ว — ไม่ใช่ Product.id ตรงๆ */
  productFamilyKey: string | null;
  gussetCount: number | null;
  thickness: string | null;
  fabrics: FabricSpecInput[];
  layers: LayerSpecInput[];
};

/** จัด seq ให้ผ้าแต่ละแถว "ภายในกลุ่ม placement เดียวกัน" (0,1,2,... แยกนับต่อ placement) —
 * ตรงกับความหมายของ @@unique([itemId, placement, seq]) จริงๆ (ไม่ใช่ index ของทั้งอาเรย์
 * ซึ่งจะทำให้ unique constraint ไม่มีความหมายเพราะ seq ไม่ซ้ำกันเองอยู่แล้วในระดับ item) */
export function assignFabricSeq<T extends { placement: string }>(fabrics: T[]): (T & { seq: number })[] {
  const seqByPlacement = new Map<string, number>();
  return fabrics.map((f) => {
    const seq = seqByPlacement.get(f.placement) ?? 0;
    seqByPlacement.set(f.placement, seq + 1);
    return { ...f, seq };
  });
}

export function computeSpecHash(input: ProductionSpecInput): string {
  const sortedFabrics = [...input.fabrics].sort((a, b) => (a.placement === b.placement ? a.seq - b.seq : a.placement.localeCompare(b.placement)));
  const sortedLayers = [...input.layers].sort((a, b) => a.seq - b.seq);

  const canonical = JSON.stringify([
    input.productFamilyKey ?? null,
    input.gussetCount ?? null,
    input.thickness ?? null,
    sortedFabrics.map((f) => [
      f.placement,
      f.seq,
      f.fabricName,
      f.fabricCode ?? null,
      f.waddingWeight ?? null,
      f.foamThickness ?? null,
      f.colorNote ?? null,
      f.extra ?? null,
    ]),
    sortedLayers.map((l) => [l.seq, l.material, l.spec]),
  ]);

  return createHash("sha256").update(canonical).digest("hex");
}
