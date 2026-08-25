import { Decimal } from "@prisma/client/runtime/library";
import { db } from "@/lib/db";
import { getEffectiveDiscountPct, roundMoney } from "@/lib/pricing";

// ==========================================================================
// Smoke Test (2026-08-25) — ส่วนลดระดับใบวางบิล: ใบส่งของส่วนใหญ่ออกราคาเต็มโดยเจตนา
// (กันพนักงานฝั่งลูกค้าเห็นส่วนลด) แต่ใบวางบิลคือยอดเงินที่เก็บจริงกับเจ้าของลูกค้า จึงให้
// เลือกตอนสร้างว่าจะหักส่วนลดกลุ่มไหม — กติกาที่ Owner ยืนยันชัดเจน:
//
// 1. "ไม่หักซ้ำ": Invoice ที่หักส่วนลดไปแล้วตอนออกใบ (discountAmount > 0 — ไม่ว่าจะกี่ %)
//    ข้ามเสมอ ยอด grandTotal ของใบนั้นเป็นยอดสุทธิอยู่แล้ว
// 2. % ที่ใช้ = Resolution เดียวกับเอกสารอื่นทั้งระบบผ่าน getEffectiveDiscountPct
//    (Rule สาขา → Rule ลูกค้า → % กลุ่ม → 0) ณ วันที่วางบิล — Invoice เก็บ productTypeCode
//    เป็น String Snapshot จึงต้อง Map กลับเป็น ProductType id ก่อน (Code Unique อยู่แล้ว)
//    Code ที่ไม่มีในระบบแล้ว/GEN (ไม่ระบุกลุ่ม) → 0% เหมือน Order/Quotation ทุกประการ
// 3. ผลลัพธ์ทั้งหมดเก็บเป็น Snapshot ใน BillingNote.discountDetail ตอนสร้างครั้งเดียว —
//    การแสดงผล/ใบพิมพ์อ่านจาก Snapshot เท่านั้น ไม่คำนวณสดซ้ำ (% กลุ่มเปลี่ยนทีหลัง
//    ใบวางบิลเดิมต้องไม่ขยับ — Snapshot Principle ข้อ 27 เดิมของระบบ)
// ==========================================================================

export type BillingNoteDiscountLine = {
  invoiceId: string;
  /** % ที่หัก ณ วันวางบิล (0 = กลุ่มไม่มีส่วนลด/ไม่ระบุกลุ่ม) */
  pct: number;
  /** จำนวนเงินส่วนลดของใบนี้ (roundMoney แล้ว) */
  amount: number;
  /** true = ใบนี้หักส่วนลดไปแล้วตอนออกใบ จึงไม่หักซ้ำ (pct/amount เป็น 0 เสมอ) */
  alreadyDiscounted: boolean;
  /** Smoke Test R4 — ชื่อกลุ่มส่วนลดของใบนี้ (Snapshot ณ วันวางบิล — Owner แจ้งลูกค้าว่า
   * "% นี้เป็นของกลุ่มไหน" ต่อใบ INV) — null = ไม่ระบุกลุ่ม/กลุ่มถูกลบไปแล้ว */
  typeName: string | null;
};

export type BillingNoteDiscountResolution = {
  lines: BillingNoteDiscountLine[];
  discountTotal: Decimal;
};

export async function resolveBillingNoteDiscounts(params: {
  customerId: string;
  billingNoteDate: Date;
  invoices: {
    id: string;
    branchId: string | null;
    productTypeCode: string;
    grandTotal: Decimal;
    discountAmount: Decimal;
  }[];
}): Promise<BillingNoteDiscountResolution> {
  const lines: BillingNoteDiscountLine[] = [];
  let discountTotal = new Decimal(0);

  // Cache การ Map code→ProductType ต่อการเรียกครั้งเดียว (Invoice หลายใบมักกลุ่มซ้ำกัน)
  const typeByCode = new Map<string, { id: string; name: string } | null>();

  for (const inv of params.invoices) {
    let type = typeByCode.get(inv.productTypeCode);
    if (type === undefined) {
      type = await db.productType.findUnique({
        where: { code: inv.productTypeCode },
        select: { id: true, name: true },
      });
      typeByCode.set(inv.productTypeCode, type ?? null);
    }
    const typeName = type?.name ?? null;

    // กติกาข้อ 1 — ไม่หักซ้ำ (ยังแนบชื่อกลุ่มให้แสดงผลได้ตามที่ Owner ขอ)
    if (inv.discountAmount.greaterThan(0)) {
      lines.push({ invoiceId: inv.id, pct: 0, amount: 0, alreadyDiscounted: true, typeName });
      continue;
    }

    if (!type) {
      // GEN (ไม่ระบุกลุ่ม) หรือกลุ่มถูกลบไปแล้ว → 0% (Semantic เดียวกับ order-preview)
      lines.push({ invoiceId: inv.id, pct: 0, amount: 0, alreadyDiscounted: false, typeName: null });
      continue;
    }

    const { discountPct } = await getEffectiveDiscountPct({
      customerId: params.customerId,
      branchId: inv.branchId,
      productTypeId: type.id,
      orderDate: params.billingNoteDate,
    });
    const amount = roundMoney(inv.grandTotal.mul(discountPct).div(100));
    discountTotal = discountTotal.add(amount);
    lines.push({
      invoiceId: inv.id,
      pct: Number(discountPct),
      amount: Number(amount),
      alreadyDiscounted: false,
      typeName,
    });
  }

  return { lines, discountTotal: roundMoney(discountTotal) };
}

/** Smoke Test R5 — Owner ยืนยันชัด: ชื่อกลุ่มบนใบวางบิลต้อง "เชื่อมโยงสด" กับชื่อกลุ่มปัจจุบัน
 * เสมอ (เปลี่ยนชื่อกลุ่มแล้วใบเดิม/พิมพ์ซ้ำต้องเห็นชื่อใหม่) — typeName ใน Snapshot จึงลดชั้น
 * เป็นแค่ Fallback เมื่อกลุ่มถูกลบ/Code หายไปจากระบบเท่านั้น — Resolve จาก productTypeCode
 * ของ Invoice แต่ละใบ (Code Unique) จุดเรียกใช้: หน้า Detail + หน้า Print ของใบวางบิล */
export async function liveTypeNamesByCode(codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes)];
  const types = await db.productType.findMany({
    where: { code: { in: unique } },
    select: { code: true, name: true },
  });
  return new Map(types.map((t) => [t.code, t.name]));
}

/** Smoke Test R9 (2026-08-25) — Owner: ไม่ว่าจะติ๊ก "ใช้ส่วนลด" หรือไม่ ใบวางบิลต้องบอกชัดว่า
 * เป็นของกลุ่มส่วนลดไหน (R7 แยกใบตามกลุ่มเสมออยู่แล้ว จึงควรเป็นกลุ่มเดียวต่อใบ) — ฟังก์ชันนี้
 * รับชื่อกลุ่มที่ Resolve แล้วของทุก Invoice ในใบวางบิลใบเดียว มาสรุปเป็น Label เดียว:
 * เหมือนกันหมด → ใช้ชื่อนั้น, ไม่มี Invoice เลย → null (ไม่แสดง), ต่างกัน → "หลายกลุ่มส่วนลด"
 * (เผื่อใบวางบิล Legacy ที่สร้างก่อน R7 ซึ่งยังไม่บังคับแยกตามกลุ่ม — ไม่กล้าฟันธงว่าเป็น
 * กลุ่มเดียวผิดๆ) */
export function resolveNoteGroupLabel(invoiceGroupLabels: string[]): string | null {
  if (invoiceGroupLabels.length === 0) return null;
  const unique = new Set(invoiceGroupLabels);
  return unique.size === 1 ? invoiceGroupLabels[0] : "หลายกลุ่มส่วนลด";
}

/** อ่าน discountDetail (Json) กลับเป็น Map ต่อ invoiceId อย่างปลอดภัย — แถว Legacy
 * (สร้างก่อน Feature นี้) ไม่มีค่า → Map ว่าง ทุกจุดแสดงผลเหมือนเดิมทุกประการ */
export function discountLinesByInvoiceId(detail: unknown): Map<string, BillingNoteDiscountLine> {
  const map = new Map<string, BillingNoteDiscountLine>();
  if (!Array.isArray(detail)) return map;
  for (const raw of detail) {
    if (raw && typeof raw === "object" && typeof (raw as any).invoiceId === "string") {
      const line = raw as BillingNoteDiscountLine;
      map.set(line.invoiceId, {
        invoiceId: line.invoiceId,
        pct: Number(line.pct) || 0,
        amount: Number(line.amount) || 0,
        alreadyDiscounted: Boolean(line.alreadyDiscounted),
        typeName: typeof line.typeName === "string" ? line.typeName : null,
      });
    }
  }
  return map;
}
