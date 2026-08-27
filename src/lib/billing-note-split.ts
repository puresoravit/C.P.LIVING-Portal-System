// ==========================================================================
// Smoke Test R7 (2026-08-25) — Auto-split ใบวางบิลตามกลุ่มส่วนลด (Owner ยืนยันชัดเจน):
// Invoice แยกใบตามกลุ่มส่วนลดมาตั้งแต่ตอน Confirm Order อยู่แล้ว (INV-A-, INV-C-, ...)
// ใบวางบิลจึงต้อง "ไม่ผสมมั่ว" เช่นกัน — เลือก Invoice ชุดเดียวแล้วระบบแตกเป็นใบวางบิล
// คนละเลขที่ต่อกลุ่มโดยอัตโนมัติ (BI ใบแรก = กลุ่ม Box Mary เรียงตามวัน, ใบถัดไป = กลุ่ม
// สปริง เรียงตามวัน) — ลูกค้าที่ไม่มีกลุ่มส่วนลด (ทุกใบเป็น GEN/กลุ่มเดียว) ได้ใบเดียว
// เรียงตามวัน/เลขที่ เหมือนพฤติกรรมเดิมทุกประการ
//
// Pure Function — รับข้อมูลที่ Query แล้ว ไม่แตะ DB เพื่อ Unit Test การแบ่ง/เรียงได้ตรงๆ
// (Pattern เดียวกับ groupByTypeAndApplyDiscount ของ order-preview)
// ==========================================================================

export type BillingSplitInvoice = {
  id: string;
  invoiceNumber: string;
  productTypeCode: string;
  invoiceDate: Date;
};

/** แบ่ง Invoice ที่เลือกเป็นชุดต่อกลุ่มส่วนลด — เรียงกลุ่มตาม Code (A, B, C, ..., GEN
 * ท้ายสุด) และภายในกลุ่มเรียงตามวันที่ → เลขที่ Invoice — ผลลัพธ์แต่ละชุด = ใบวางบิล 1 ใบ */
export function partitionInvoicesForBilling<T extends BillingSplitInvoice>(invoices: T[]): T[][] {
  const byCode = new Map<string, T[]>();
  for (const inv of invoices) {
    const arr = byCode.get(inv.productTypeCode) ?? [];
    arr.push(inv);
    byCode.set(inv.productTypeCode, arr);
  }

  const codes = [...byCode.keys()].sort((a, b) => {
    // GEN (ไม่ระบุกลุ่ม) ไปท้ายสุดเสมอ — กลุ่มจริงเรียงตามรหัสตามลำดับที่ผู้ใช้คุ้นเคย
    if (a === "GEN" && b !== "GEN") return 1;
    if (b === "GEN" && a !== "GEN") return -1;
    return a.localeCompare(b);
  });

  return codes.map((code) => {
    const group = byCode.get(code)!;
    return [...group].sort(
      (a, b) =>
        a.invoiceDate.getTime() - b.invoiceDate.getTime() || a.invoiceNumber.localeCompare(b.invoiceNumber)
    );
  });
}

/** R11 — ข้อ 7 (Owner): โหมด "ไม่แยกใบตามกลุ่มส่วนลด" — รวมทุกใบเป็นชุดเดียว เรียงตาม
 * วันที่ → เลขที่ Invoice (Comparator เดียวกับภายในกลุ่มของโหมดแยกทุกประการ) — คืน Shape
 * เดียวกับ partitionInvoicesForBilling (Array ของชุด) ให้ Caller ใช้โค้ดเดิมได้ทั้งเส้น */
export function singleBillingGroup<T extends BillingSplitInvoice>(invoices: T[]): T[][] {
  if (invoices.length === 0) return [];
  const sorted = [...invoices].sort(
    (a, b) =>
      a.invoiceDate.getTime() - b.invoiceDate.getTime() || a.invoiceNumber.localeCompare(b.invoiceNumber)
  );
  return [sorted];
}
