import { STANDARD_MATTRESS_SIZES } from "@/lib/standard-sizes";

// ==========================================================================
// Owner UAT (2026-09-02) — Stable Product Ordering สำหรับรายการสินค้าในเอกสาร
//
// ปัญหาเดิม: ลำดับแสดงผล = ลำดับเวลาที่เพิ่มรายการ (Insertion Order ของแถวใน DB ล้วนๆ
// ไม่มีคอลัมน์ sortOrder และไม่มี orderBy ที่ไหนเลย) — ลบรายการแล้วเพิ่มกลับ รายการจะ
// หลุดไปต่อท้ายสุด ไม่กลับเข้ากลุ่มสินค้า/รุ่นของตัวเอง
//
// แก้ด้วย Helper กลางตัวเดียว Sort ตอนอ่าน (ไม่เพิ่มคอลัมน์/Migration — Requirement
// "Re-add ต้องจัดตำแหน่งใหม่ถูกต้องอัตโนมัติ" ได้มาฟรีเพราะลำดับไม่ผูกกับเวลา Insert เลย):
//
// 1. จัดกลุ่มตาม Family = Product.name — ใช้ได้เพราะ Convention เดิมของระบบ (ดู
//    product-variant-size.ts syncStandardVariants): Size Variant ทุกตัวใช้ "ชื่อตัวหลัก"
//    เป๊ะ ขนาดอยู่ใน Product.size แยกต่างหากเสมอ — ห้ามใช้ descriptionOverride เป็นกุญแจ
//    กลุ่ม (เป็นข้อความแสดงผลที่ User พิมพ์เอง รายการ Custom Size ต้องยังอยู่กลุ่มเดิม)
// 2. ลำดับระหว่าง Family: ProductModel.sortOrder (Catalog Ordering เดิมที่ Owner จัดใน
//    หน้ารุ่นสินค้า — Reuse ตาม Requirement) → Family ที่ไม่มี Model (Anchor Product/
//    สินค้าเดี่ยว) ต่อท้ายกลุ่มที่มี Model แล้วเรียงตามชื่อ (Deterministic Fallback ตามที่
//    Owner ระบุ)
// 3. ภายใน Family: Size ตามลำดับ Natural ของ STANDARD_MATTRESS_SIZES (3 → 3.5 → 4 →
//    5 → 6) — ไม่มี Size เลยขึ้นก่อน, ขนาดพิเศษ/ระบุเอง (ไม่ตรง Standard Label) ต่อท้าย
//    เรียงตามข้อความ — Tie-break สุดท้ายด้วย id เสมอ (Deterministic ทุกกรณี)
//
// ใช้ร่วมกันทุกจุดที่แสดง/คำนวณ Product Lines ฝั่ง Billing (Order/Quotation: หน้า Detail,
// Preview Engine, Edit Modal, หน้า Print) เพื่อให้ทุก Document เรียงแบบเดียวกันเป๊ะ —
// Invoice/TaxInvoice ไม่ Sort ตอนอ่าน (Snapshot Document — แถวถูกสร้างตามลำดับ Preview
// ที่ Sort แล้ว ณ ตอน Confirm จึงเรียงถูกตั้งแต่เกิด เอกสารเก่าไม่ถูกแตะเลย)
//
// Pure Function ล้วนๆ (คืน Array ใหม่ ไม่ Mutate ของเดิม) — Test ที่ product-line-sort.test.ts
// ==========================================================================

export type ProductLineSortInfo = {
  /** Product.name ของสินค้าจริงบนบรรทัด (ชื่อฐานของ Family — ไม่ใช่ descriptionOverride) */
  familyName: string;
  /** sizeOverride || Product.size — ขนาดที่มีผลจริงของบรรทัดนี้ */
  size: string | null;
  /** ProductModel.sortOrder ของสินค้า (null = สินค้าไม่ผูกรุ่น) */
  familySortOrder: number | null;
  /** id ของบรรทัด — Tie-break สุดท้ายให้ลำดับนิ่งเสมอ */
  id: string;
};

const STANDARD_SIZE_RANK = new Map(STANDARD_MATTRESS_SIZES.map((s, i) => [s.label, i]));

/** ลำดับ Size ภายใน Family: ไม่มี Size = -1 (ขึ้นก่อน) → Standard ตามตาราง → พิเศษต่อท้าย */
function sizeRank(size: string | null): number {
  if (!size) return -1;
  return STANDARD_SIZE_RANK.get(size) ?? STANDARD_MATTRESS_SIZES.length;
}

export function sortProductLines<T>(lines: readonly T[], info: (line: T) => ProductLineSortInfo): T[] {
  // Pass 1 — จัดกลุ่มตาม familyName แล้วหา Rank ของกลุ่ม = ค่า sortOrder ต่ำสุดที่มีจริง
  // ในกลุ่ม (บรรทัดในกลุ่มเดียวกันอาจมีทั้งที่รู้และไม่รู้ sortOrder เช่นรายการ Custom Size
  // ที่เพิ่งเพิ่มจาก Modal ฝั่ง Client ซึ่งไม่มีข้อมูลรุ่น — ใช้ค่าที่ดีที่สุดที่กลุ่มมี)
  //
  // Owner UAT (2026-09-02 — Physical Print INV-A-202609-0001): กลุ่ม "อุปกรณ์เสริม"
  // (ขาตั้ง/ตะขอ/ล้อเบรค ฯลฯ) เคยแทรกขึ้นบนสุดเพราะตกไปเรียงตามชื่อ ก-ฮ ปนกับที่นอน —
  // เพิ่ม Bucket ชั้นนอกสุด: Family ไปอยู่ "ท้ายเอกสาร" เมื่อไม่มีทั้ง Catalog sortOrder
  // และไม่มีขนาดเลยสักบรรทัด (สินค้าไม่มี Size = ไม่ใช่ที่นอน/บล็อค = อุปกรณ์เสริม —
  // เกณฑ์เชิงโครงสร้างข้อมูล ไม่ Hardcode ชื่อ/หน่วยธุรกิจ) — การจัดกลุ่มตาม Family
  // ภายในแต่ละ Bucket ยังเหมือนเดิมทุกประการ
  const familyRank = new Map<string, number>();
  const familyHasSize = new Map<string, boolean>();
  for (const line of lines) {
    const { familyName, familySortOrder, size } = info(line);
    const current = familyRank.get(familyName);
    const rank = familySortOrder ?? Number.MAX_SAFE_INTEGER;
    if (current == null || rank < current) familyRank.set(familyName, rank);
    if (size) familyHasSize.set(familyName, true);
    else if (!familyHasSize.has(familyName)) familyHasSize.set(familyName, false);
  }
  const familyBucket = (name: string) =>
    familyRank.get(name)! !== Number.MAX_SAFE_INTEGER || familyHasSize.get(name)! ? 0 : 1;

  // Pass 2 — Sort ด้วยกุญแจ (bucket, familyRank, familyName, sizeRank, sizeText, id)
  return [...lines].sort((a, b) => {
    const ia = info(a);
    const ib = info(b);
    const bucketDiff = familyBucket(ia.familyName) - familyBucket(ib.familyName);
    if (bucketDiff !== 0) return bucketDiff;
    const rankDiff = familyRank.get(ia.familyName)! - familyRank.get(ib.familyName)!;
    if (rankDiff !== 0) return rankDiff;
    const nameDiff = ia.familyName.localeCompare(ib.familyName, "th");
    if (nameDiff !== 0) return nameDiff;
    const sizeDiff = sizeRank(ia.size) - sizeRank(ib.size);
    if (sizeDiff !== 0) return sizeDiff;
    const sizeTextDiff = (ia.size ?? "").localeCompare(ib.size ?? "", "th");
    if (sizeTextDiff !== 0) return sizeTextDiff;
    return ia.id.localeCompare(ib.id);
  });
}
