import { Decimal } from "@prisma/client/runtime/library";

// ==========================================================================
// Owner UAT (2026-08-29) — "หมวดค้างส่ง": ตอนแก้ไข Invoice ที่พิมพ์แล้วให้ยอดลดลง
// (เช่นลูกค้าตีกลับสินค้าบางส่วน) ต้องคำนวณว่า "อะไรค้างส่ง" (รายการ+จำนวนที่ลดไป)
// จับคู่รายการเดิม/ใหม่ด้วย productId+sizeSnapshot (คีย์เดียวกับที่มนุษย์มองว่าเป็น
// "ของชิ้นเดียวกัน") — รวมจำนวนต่อคีย์ก่อนเทียบ กันกรณีมีหลายบรรทัดสินค้าเดียวกัน
//
// Pure Function — ไม่แตะ DB เพื่อ Unit Test ตรงๆ ได้ (Caller ใน editConfirmedOrder
// ดึง Old/New Items จริงมาป้อนเข้าฟังก์ชันนี้)
// ==========================================================================

export type RedeliveryLineInput = {
  productId: string;
  productNameSnapshot: string;
  sizeSnapshot: string | null;
  unitSnapshot: string;
  quantity: Decimal | number;
};

export type RedeliveryLine = {
  productNameSnapshot: string;
  sizeSnapshot: string | null;
  unitSnapshot: string;
  quantity: number;
};

function keyOf(item: RedeliveryLineInput): string {
  return `${item.productId}::${item.sizeSnapshot ?? ""}`;
}

/** รวมยอด Invoice เดิม vs ใหม่แล้วหาว่ารายการไหน "ลดลง" (คีย์หายไปทั้งคู่ = ลดเต็มจำนวน) —
 * คืน [] ถ้าไม่มีอะไรลดลงเลย (ยอดเท่าเดิม/เพิ่มขึ้น/แค่สลับสินค้าคนละตัวโดยยอดรวมเท่ากัน
 * ยังนับว่า "ไม่ลด" ตาม Field นี้ — การตัดสินว่าเข้า "ค้างส่ง" หรือไม่ ดูจาก grandTotal
 * รวมที่ Caller เทียบเอง ไม่ใช่ฟังก์ชันนี้) */
export function computeRedeliveryLines(oldItems: RedeliveryLineInput[], newItems: RedeliveryLineInput[]): RedeliveryLine[] {
  const oldByKey = new Map<string, { info: RedeliveryLineInput; qty: Decimal }>();
  for (const item of oldItems) {
    const key = keyOf(item);
    const existing = oldByKey.get(key);
    const qty = new Decimal(item.quantity);
    oldByKey.set(key, existing ? { info: existing.info, qty: existing.qty.add(qty) } : { info: item, qty });
  }

  const newQtyByKey = new Map<string, Decimal>();
  for (const item of newItems) {
    const key = keyOf(item);
    const qty = new Decimal(item.quantity);
    newQtyByKey.set(key, (newQtyByKey.get(key) ?? new Decimal(0)).add(qty));
  }

  const lines: RedeliveryLine[] = [];
  for (const [key, { info, qty: oldQty }] of oldByKey) {
    const newQty = newQtyByKey.get(key) ?? new Decimal(0);
    const reduced = oldQty.sub(newQty);
    if (reduced.gt(0)) {
      lines.push({
        productNameSnapshot: info.productNameSnapshot,
        sizeSnapshot: info.sizeSnapshot,
        unitSnapshot: info.unitSnapshot,
        quantity: reduced.toNumber(),
      });
    }
  }
  return lines;
}
