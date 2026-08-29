import type { RevisionChangeType } from "@prisma/client";

// S4 S5 — ดึงออกมาจาก src/app/production/orders/[id]/page.tsx เดิม (เคยเป็น closure
// เฉพาะหน้า) เพื่อ reuse กับหน้า "ประวัติ" (S5) โดยไม่ต้องเขียน logic แปลง
// CustomerPORevisionChange เป็นข้อความภาษาคนซ้ำสอง — พฤติกรรม/ข้อความเหมือนเดิมทุกตัวอักษร

export const CHANGE_TYPE_LABEL: Record<string, string> = {
  ADD_LINE: "เพิ่มรายการ",
  QTY_CHANGE: "แก้จำนวน",
  CANCEL_LINE: "ยกเลิกรายการ",
  RESOLVE_PRODUCT: "ผูกสินค้าจากระบบ",
  ORDER_LEVEL: "แก้ข้อมูลหัวออเดอร์",
};

export type CustomerPoChangeLike = {
  changeType: RevisionChangeType;
  before: unknown;
  after: unknown;
};

/** ดึง productId ทั้งหมดที่ปรากฏใน snapshot (before/after) ของชุด changes — ใช้ batch fetch
 * ชื่อสินค้ามาแสดงแทน id ดิบ ก่อนเรียก describeCustomerPoChange */
export function collectSnapshotProductIds(changes: CustomerPoChangeLike[]): Set<string> {
  const ids = new Set<string>();
  for (const c of changes) {
    for (const snap of [c.before, c.after]) {
      const pid = (snap as Record<string, unknown> | null)?.productId;
      if (typeof pid === "string") ids.add(pid);
    }
  }
  return ids;
}

export function describeCustomerPoChange(c: CustomerPoChangeLike, productLabelById: Map<string, string>): string {
  const before = (c.before ?? {}) as Record<string, any>;
  const after = (c.after ?? {}) as Record<string, any>;
  const labelOf = (snap: Record<string, any>) =>
    snap.lineKind === "CATALOG" ? productLabelById.get(snap.productId) ?? "(สินค้าที่ถูกลบ)" : snap.rawProductText || "—";
  switch (c.changeType) {
    case "ADD_LINE":
      return `+ เพิ่ม "${labelOf(after)}"${after.size ? ` ไซส์ ${after.size}` : ""} จำนวน ${after.qty}`;
    case "CANCEL_LINE":
      return `- ยกเลิก "${labelOf(before)}"${before.size ? ` ไซส์ ${before.size}` : ""} จำนวน ${before.qty}`;
    case "RESOLVE_PRODUCT":
      return `ผูกกับสินค้า "${labelOf(after)}" (เดิมพิมพ์เอง: "${before.rawProductText ?? "—"}")`;
    case "QTY_CHANGE":
      return `"${labelOf(before)}" จำนวน ${before.qty} → ${after.qty}`;
    case "ORDER_LEVEL":
      return "แก้ข้อมูลหัวออเดอร์ (ลูกค้า/สาขา/วันที่/ด่วน)";
    default:
      return CHANGE_TYPE_LABEL[c.changeType] ?? c.changeType;
  }
}
