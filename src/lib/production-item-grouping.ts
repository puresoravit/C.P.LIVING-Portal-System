// S3 CP2 — จัดกลุ่ม ProductionItem ตาม specHash เป็น "Production Block" สำหรับแสดงผล: รายการ
// ที่ specHash ตรงกันเป๊ะ (family+gusset+thickness+fabric+layers เหมือนกันทุกอย่าง ต่างแค่
// ไซส์/qty/บรรทัดต้นทาง) รวมเป็นบล็อกเดียว ไม่ต้องแสดงสเปกซ้ำทุกไซส์ — เป็น derived view
// ล้วนๆ (คำนวณตอนอ่าน ไม่ได้เก็บ groupId ลง DB ใหม่) เพราะ specHash มีอยู่แล้วพอสำหรับ
// ตัดสินว่า "นี่คือสเปกเดียวกันหรือไม่" ไม่ต้องเพิ่ม schema

export type GroupableItem = {
  specHash: string;
  qty: number;
};

export type ProductionSpecGroup<T extends GroupableItem> = {
  specHash: string;
  /** รายการแรกในกลุ่ม — ใช้แสดง fabric/layer/gusset/thickness ร่วม (ทุกแถวในกลุ่มมีค่าตรงกัน
   * อยู่แล้วเพราะ specHash เหมือนกัน) */
  representative: T;
  items: T[];
  totalQty: number;
};

/** เรียงกลุ่มตามลำดับที่ specHash ปรากฏครั้งแรกในอาเรย์ต้นฉบับ (deterministic ตามลำดับ input ไม่สุ่ม) */
export function groupItemsBySpecHash<T extends GroupableItem>(items: T[]): ProductionSpecGroup<T>[] {
  const order: string[] = [];
  const byHash = new Map<string, T[]>();
  for (const item of items) {
    if (!byHash.has(item.specHash)) {
      byHash.set(item.specHash, []);
      order.push(item.specHash);
    }
    byHash.get(item.specHash)!.push(item);
  }
  return order.map((specHash) => {
    const groupItems = byHash.get(specHash)!;
    return {
      specHash,
      representative: groupItems[0],
      items: groupItems,
      totalQty: groupItems.reduce((sum, i) => sum + i.qty, 0),
    };
  });
}
