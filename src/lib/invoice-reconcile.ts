// ==========================================================================
// R11 (2026-08-27) — ข้อ 5 (Owner): แก้ไข Order ที่ Confirm แล้ว ต้อง "คงเลข INV เดิม"
// — หน้างานจริงลูกค้าขีดฆ่าแก้บนกระดาษใบเดิม ไม่อยากได้เลขใหม่ทุกครั้งที่แก้
//
// Invoice แตกใบตามกลุ่มส่วนลด (productTypeCode) มาตั้งแต่ Confirm — การแก้ไขจึงกระทบ
// เป็นรายกลุ่ม: กลุ่มที่ยังอยู่ = แก้ยอดในใบเดิม (เลข/สถานะ/printedAt คงเดิม), กลุ่มที่
// รายการหายหมด = ยกเลิกใบนั้น, กลุ่มใหม่ที่เพิ่งโผล่ = ออกใบใหม่ (เลขใหม่เฉพาะใบนั้น)
// — ตรงตามที่ Owner เคาะ: "ถ้ามีการแก้ใช้เลขเดิม แต่ถ้ากลุ่มไหนลบออกหมด เลข INV นั้นก็ลบไป"
//
// Pure Function — Unit Test ตรงๆ ได้ (การเขียนจริงอยู่ใน editConfirmedOrder)
// ==========================================================================

export type InvoiceReconcilePlan = {
  /** กลุ่มที่ยังอยู่ → แก้ยอดในใบเดิม (เลขเดิม) */
  updates: { productTypeCode: string; invoiceId: string }[];
  /** ใบที่ต้องยกเลิก: กลุ่มที่รายการหายหมด + ใบซ้ำเกินของกลุ่มเดียวกัน (Edge — ปกติไม่เกิด) */
  cancels: string[];
  /** กลุ่มใหม่ที่ยังไม่มีใบ → ออกใบใหม่ */
  creates: string[];
};

export function reconcileInvoiceGroups(
  existingActive: { id: string; productTypeCode: string }[],
  newGroupCodes: string[]
): InvoiceReconcilePlan {
  const byCode = new Map<string, string[]>();
  for (const inv of existingActive) {
    byCode.set(inv.productTypeCode, [...(byCode.get(inv.productTypeCode) ?? []), inv.id]);
  }

  const updates: InvoiceReconcilePlan["updates"] = [];
  const cancels: string[] = [];
  const creates: string[] = [];
  const newSet = new Set(newGroupCodes);

  for (const code of newGroupCodes) {
    const ids = byCode.get(code) ?? [];
    if (ids.length > 0) {
      updates.push({ productTypeCode: code, invoiceId: ids[0] });
      cancels.push(...ids.slice(1)); // ใบซ้ำกลุ่มเดียวกัน (สถานะผิดปกติ) — เก็บใบแรก ยกเลิกที่เหลือ
    } else {
      creates.push(code);
    }
  }
  for (const [code, ids] of byCode) {
    if (!newSet.has(code)) cancels.push(...ids);
  }

  return { updates, cancels, creates };
}
