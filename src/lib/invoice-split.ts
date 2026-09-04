import { Decimal } from "@prisma/client/runtime/library";
import { PRINTED_SHEET_BLOCK } from "@/lib/invoice-sheets";

// ==========================================================================
// Owner (2026-09-04) — Invoice (ใบส่งของชั่วคราว) แบบใหม่: "ใบละสูงสุด 14 รายการ + สรุปเต็ม
// ทุกใบ" — โรงงานใช้แบบฟอร์มเดียว 14 แถว รายการที่ 15 ขึ้นไปออกเป็น "ใบใหม่" เลข INV ถัดไป
// ของกลุ่มส่วนลดเดิม ลำดับรายการเริ่ม 1 ใหม่ ยอดรวม/ส่วนลด/สุทธิ/ตัวอักษร คิดเฉพาะรายการใน
// ใบนั้น (ไม่มียอดรวมทั้งออเดอร์บนกระดาษ — Owner ยืนยัน) แต่ละใบเป็นเอกสารแยกจริงในระบบ
// (พิมพ์แล้ว/ยกเลิก/ยอดขาย/ค้างส่ง/ใบกำกับ แยกรายใบ)
//
// สิ่งที่ "ไม่" เปลี่ยน: การแตกใบตามกลุ่มส่วนลด (productTypeCode) ยังอยู่ — ตอนนี้ 1 กลุ่ม
// = N ใบ (เดิม 1 กลุ่ม = 1 ใบหลายแผ่น) · ระบบแผ่นพิมพ์ (invoice-sheets.ts) ยังใช้เขียน
// รายการทุกใบเหมือนเดิม แค่ใบใหม่ทุกใบมีแผ่นเดียวเสมอ (≤14 บรรทัด = ความจุ "แผ่นจบเดี่ยว"
// ที่ Owner วัดจากกระดาษจริง) — ใบเก่าหลายแผ่นไม่ถูกแตะ พิมพ์ได้หน้าตาเดิมตลอดไป
//
// กฎแก้ไขหลัง Confirm (ย้ายกฎ "แผ่นพิมพ์แล้วห้ามแก้" มาเป็นระดับใบ — Owner อนุมัติ 2026-09-04):
//   - ใบที่พิมพ์แล้ว "แช่แข็ง" ทั้งใบ: รายการข้างในทุกบรรทัดต้องยังอยู่ในออเดอร์ครบ เนื้อหา
//     เท่าเดิม (สินค้า/ชื่อ/ขนาด/จำนวน/ราคา) และ % ส่วนลดกลุ่มไม่เปลี่ยน — ไม่งั้น BLOCK
//     ทั้ง Transaction พร้อมเหตุผล (ต้องยกเลิกใบนั้นแล้วออกใหม่)
//   - รายการที่เหลือ (นอกใบพิมพ์แล้ว) จัดใหม่ทีละ 14 ลงใบที่ยังไม่พิมพ์ของกลุ่ม "ใช้เลขเดิม
//     ตามลำดับ" · เกิน = ใบใหม่เลขใหม่ · ใบที่ว่างลง = ยกเลิก (เลขคงเป็นสถานะยกเลิก)
//   - เพิ่มรายการเข้ากลุ่มที่ใบเดียวพิมพ์แล้ว (เต็มหรือไม่เต็มก็ตาม) = ใบใหม่เฉพาะรายการที่เพิ่ม
//
// Pure Function ทั้งไฟล์ — Test ตรงๆ ที่ invoice-split.test.ts — การเขียน DB อยู่ที่
// invoice-group-apply.ts
// ==========================================================================

/** จำนวนรายการสูงสุดต่อ 1 ใบ (แบบฟอร์มโรงงาน 14 แถว + สรุปเต็ม) — จุดเดียวที่ตัดสิน */
export const INVOICE_MAX_LINES = 14;

/** ตัดรายการ (เรียงลำดับแล้ว) เป็นใบละไม่เกิน max รายการ — ไม่มีใบว่าง */
export function chunkInvoiceLines<T>(lines: readonly T[], max: number = INVOICE_MAX_LINES): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lines.length; i += max) out.push(lines.slice(i, i + max));
  return out;
}

/** ฟิลด์ "ดิบ" ของบรรทัดที่ปรากฏบนกระดาษและไม่ขึ้นกับว่าอยู่ใบไหน (ส่วนลดที่จัดสรรต่อบรรทัด
 * ขึ้นกับเพื่อนร่วมใบ จึงไม่อยู่ในนี้ — ใบพิมพ์แล้วคงค่าที่จัดสรรไว้เดิมทั้งชุด) */
export type InvoiceRawLine = {
  productId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  sizeSnapshot: string | null;
  quantity: unknown;
  unitSnapshot: string;
  unitPriceSnapshot: unknown;
  grossAmount: unknown;
};

const D = (v: unknown) => new Decimal(v as Decimal.Value);

export function invoiceLineRawMatches(a: InvoiceRawLine, b: InvoiceRawLine): boolean {
  return (
    a.productId === b.productId &&
    a.skuSnapshot === b.skuSnapshot &&
    a.productNameSnapshot === b.productNameSnapshot &&
    (a.sizeSnapshot ?? null) === (b.sizeSnapshot ?? null) &&
    a.unitSnapshot === b.unitSnapshot &&
    D(a.quantity).eq(D(b.quantity)) &&
    D(a.unitPriceSnapshot).eq(D(b.unitPriceSnapshot)) &&
    D(a.grossAmount).eq(D(b.grossAmount))
  );
}

export type ExistingGroupInvoice = {
  id: string;
  invoiceNumber: string;
  /** ใบนี้ (แผ่นใดแผ่นหนึ่ง/ใบหลัก) ยืนยันพิมพ์แล้ว → แช่แข็ง */
  printed: boolean;
  discountPct: unknown;
  lines: InvoiceRawLine[];
};

export type GroupInvoicePlan<L> = {
  /** ใบพิมพ์แล้ว — ไม่แตะรายการ/ยอดเลย (Header อื่นที่ไม่ใช่รายการ Caller ตัดสินเอง) */
  frozen: { invoiceId: string; invoiceNumber: string }[];
  /** ใบยังไม่พิมพ์ที่ได้รายการชุดใหม่ (เลขเดิม) — เรียงตามเลขใบ */
  assignments: { invoiceId: string; invoiceNumber: string; lines: L[] }[];
  /** รายการที่เกินจำนวนใบเดิม → ออกใบใหม่ทีละก้อน (เรียงตามลำดับรายการ) */
  creates: L[][];
  /** ใบยังไม่พิมพ์ที่ไม่เหลือรายการให้ → ยกเลิก */
  cancels: { invoiceId: string; invoiceNumber: string }[];
};

/**
 * วางแผนใบของ "1 กลุ่มส่วนลด" จากรายการชุดใหม่ (เรียงลำดับแล้ว) เทียบกับใบ Active เดิม
 * — Throw ด้วย Prefix PRINTED_SHEET_BLOCK เมื่อการแก้กระทบใบพิมพ์แล้ว (Caller จับ Prefix
 * เดิมตัวเดียวกับ Sheet Engine เพื่อคืนเหตุผลจริงให้ผู้ใช้)
 */
export function reconcileGroupInvoices<L extends InvoiceRawLine>(params: {
  existing: ExistingGroupInvoice[];
  newLines: readonly L[];
  groupDiscountPct: unknown;
  maxLines?: number;
}): GroupInvoicePlan<L> {
  const max = params.maxLines ?? INVOICE_MAX_LINES;
  const byNumber = [...params.existing].sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
  const consumed = new Set<number>();
  const frozen: GroupInvoicePlan<L>["frozen"] = [];

  for (const inv of byNumber.filter((i) => i.printed)) {
    if (!D(inv.discountPct).eq(D(params.groupDiscountPct))) {
      throw new Error(
        `${PRINTED_SHEET_BLOCK}:แก้ไขไม่ได้ — % ส่วนลดของกลุ่มเปลี่ยน (${D(inv.discountPct).toString()}% → ${D(params.groupDiscountPct).toString()}%) กระทบยอดของใบที่พิมพ์แล้ว ${inv.invoiceNumber} — ต้องยกเลิกใบนั้นแล้วออกใหม่`
      );
    }
    for (const line of inv.lines) {
      let found = -1;
      for (let i = 0; i < params.newLines.length; i++) {
        if (consumed.has(i)) continue;
        if (invoiceLineRawMatches(line, params.newLines[i])) {
          found = i;
          break;
        }
      }
      if (found < 0) {
        throw new Error(
          `${PRINTED_SHEET_BLOCK}:แก้ไขไม่ได้ — รายการ "${line.productNameSnapshot}${line.sizeSnapshot ? ` ${line.sizeSnapshot}` : ""}" อยู่ในใบที่พิมพ์แล้ว ${inv.invoiceNumber} (แก้/ลบรายการในใบพิมพ์แล้วไม่ได้) — แก้ได้เฉพาะรายการในใบที่ยังไม่พิมพ์ หรือยกเลิกใบนั้นแล้วออกใหม่`
        );
      }
      consumed.add(found);
    }
    frozen.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber });
  }

  const remaining = params.newLines.filter((_, i) => !consumed.has(i));
  const chunks = chunkInvoiceLines(remaining, max);
  const unprinted = byNumber.filter((i) => !i.printed);

  const assignments: GroupInvoicePlan<L>["assignments"] = [];
  for (let i = 0; i < Math.min(chunks.length, unprinted.length); i++) {
    assignments.push({ invoiceId: unprinted[i].id, invoiceNumber: unprinted[i].invoiceNumber, lines: chunks[i] });
  }
  const creates = chunks.slice(unprinted.length);
  const cancels = unprinted.slice(chunks.length).map((i) => ({ invoiceId: i.id, invoiceNumber: i.invoiceNumber }));

  return { frozen, assignments, creates, cancels };
}
