import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { roundMoney, allocateProportionally } from "@/lib/pricing";
import { getNextSeq, formatDocNumber } from "@/lib/running-number";
import { syncInvoiceSheets } from "@/lib/invoice-sheets";
import type { PreviewTypeGroup } from "@/lib/order-preview";
import { reconcileGroupInvoices, type ExistingGroupInvoice, type InvoiceRawLine } from "@/lib/invoice-split";

// ==========================================================================
// Owner (2026-09-04) — ตัวเขียน DB ของ "1 กลุ่มส่วนลด = N ใบ ใบละ ≤14 รายการ" — จุดเดียวที่
// confirmOrder / editConfirmedOrder / changeOrderCustomer ใช้ร่วมกัน (เดิม 3 ฟังก์ชันมีสำเนา
// Loop สร้าง/แก้/ยกเลิกใบของตัวเอง) — แผนมาจาก reconcileGroupInvoices (Pure) ยอดต่อใบคิดจาก
// รายการในใบนั้นเท่านั้น (Owner: ส่วนลด % คิดแยกทีละใบ รับความต่างเศษสตางค์ได้) รายการถูก
// เขียนผ่าน Sheet Engine เดิม (ใบใหม่ ≤14 บรรทัด = แผ่นเดียวเสมอ)
// ==========================================================================

export type InvoiceHeaderContext = {
  orderId: string;
  orderDate: Date;
  period: string;
  placeToDelivery: string | null;
  applyDiscount: boolean;
  customerId: string;
  branchId: string | null;
  customerNameSnapshot: string;
  taxIdSnapshot: string | null;
  branchNameSnapshot: string | null;
  addressSnapshot: string | null;
};

/** Header ของใบใหม่/ใบที่แก้ จาก Order + ลูกค้า/สาขา (Snapshot ณ ตอนเขียน — กฎเดิมข้อ 27) */
export function invoiceHeaderFromOrder(
  order: { id: string; orderDate: Date; placeToDelivery: string | null; applyDiscount: boolean },
  customer: { id: string; companyName: string; taxId: string | null; address: string | null },
  branch: { id: string; name: string; address: string | null } | null,
  period: string
): InvoiceHeaderContext {
  return {
    orderId: order.id,
    orderDate: order.orderDate,
    period,
    placeToDelivery: order.placeToDelivery,
    applyDiscount: order.applyDiscount,
    customerId: customer.id,
    branchId: branch?.id ?? null,
    customerNameSnapshot: customer.companyName,
    taxIdSnapshot: customer.taxId,
    branchNameSnapshot: branch?.name ?? null,
    addressSnapshot: branch?.address ?? customer.address ?? null,
  };
}

export type ExistingInvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  printedAt: Date | null;
  discountPct: Decimal;
  grandTotal: Decimal;
  customerNameSnapshot: string;
  sheets: { printedAt: Date | null }[];
  items: InvoiceRawLine[];
};

type RawLineWithId = InvoiceRawLine & { orderItemId: string; productTypeSnapshot: string; grossAmount: Decimal };

/** ยอดของ 1 ใบจากรายการในใบนั้น + จัดสรรส่วนลด (จริง/เชิงสถิติ) ลงบรรทัดแบบเดิม (ข้อ 26/R12) */
function buildChunk(chunk: RawLineWithId[], discountPct: Decimal, forcedPct: Decimal) {
  const gross = chunk.reduce((s, l) => s.add(l.grossAmount), new Decimal(0));
  const discountAmount = roundMoney(gross.mul(discountPct).div(100));
  const net = roundMoney(gross.sub(discountAmount));
  const alloc = allocateProportionally(chunk.map((l) => l.grossAmount), discountAmount);
  const forcedAlloc = allocateProportionally(chunk.map((l) => l.grossAmount), roundMoney(gross.mul(forcedPct).div(100)));
  const payloads = chunk.map((l, i) => {
    const lineNet = roundMoney(l.grossAmount.sub(alloc[i]));
    return {
      productId: l.productId,
      skuSnapshot: l.skuSnapshot,
      productNameSnapshot: l.productNameSnapshot,
      productTypeSnapshot: l.productTypeSnapshot,
      sizeSnapshot: l.sizeSnapshot,
      quantity: l.quantity as Decimal,
      unitSnapshot: l.unitSnapshot,
      unitPriceSnapshot: l.unitPriceSnapshot as Decimal,
      grossAmount: l.grossAmount,
      discountAmount: alloc[i],
      netAmount: lineNet,
      vatAmount: new Decimal(0),
      totalAmount: lineNet,
      statDiscountAmount: forcedAlloc[i],
    };
  });
  return { gross, discountAmount, net, payloads };
}

export type ApplyGroupResult = { created: string[]; updated: string[]; frozen: string[]; cancelled: string[] };

export async function applyInvoiceGroupPlan(
  tx: Prisma.TransactionClient,
  params: {
    header: InvoiceHeaderContext;
    group: PreviewTypeGroup;
    /** กลุ่มเดียวกันจาก Forced Preview (ส่วนลดเชิงสถิติ R12) — ไม่มี = ใช้ % เดียวกับ group */
    forcedGroup: PreviewTypeGroup | undefined;
    /** ใบ Active เดิมของกลุ่มนี้ (ว่าง = Confirm ครั้งแรก) */
    existing: ExistingInvoiceRow[];
    userId: string;
    note: string;
    /** เปลี่ยนบริษัท/สาขา: เขียน Header ลูกค้าใหม่ลง "ทุกใบ Active" รวมใบพิมพ์แล้ว (Owner
     * 2026-08-31 — "เดี๋ยวทำลายกระดาษเก่าทิ้งเอง") — รายการ/ยอดของใบพิมพ์แล้วยังแช่แข็ง */
    patchCustomerOnFrozen?: boolean;
  }
): Promise<ApplyGroupResult> {
  const { header, group, userId, note } = params;
  const docType = `INV-${group.productTypeCode}`;
  const forcedPct = params.forcedGroup?.discountPct ?? group.discountPct;

  const rawLines: RawLineWithId[] = group.items.map((item) => ({
    orderItemId: item.orderItemId,
    productId: item.productId,
    skuSnapshot: item.sku,
    productNameSnapshot: item.productName,
    productTypeSnapshot: item.productTypeName,
    sizeSnapshot: item.size,
    quantity: item.quantity,
    unitSnapshot: item.unit,
    unitPriceSnapshot: item.unitPrice,
    grossAmount: item.grossAmount,
  }));

  const existing: ExistingGroupInvoice[] = params.existing.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    printed: inv.status === "PRINTED" || inv.printedAt != null || inv.sheets.some((s) => s.printedAt != null),
    discountPct: inv.discountPct,
    lines: inv.items,
  }));
  const byId = new Map(params.existing.map((i) => [i.id, i]));

  const plan = reconcileGroupInvoices({ existing, newLines: rawLines, groupDiscountPct: group.discountPct });
  const result: ApplyGroupResult = { created: [], updated: [], frozen: [], cancelled: [] };

  const customerPatch = {
    customerId: header.customerId,
    branchId: header.branchId,
    customerNameSnapshot: header.customerNameSnapshot,
    taxIdSnapshot: header.taxIdSnapshot,
    branchNameSnapshot: header.branchNameSnapshot,
    addressSnapshot: header.addressSnapshot,
  };

  for (const f of plan.frozen) {
    result.frozen.push(f.invoiceNumber);
    if (!params.patchCustomerOnFrozen) continue;
    const inv = byId.get(f.invoiceId)!;
    await tx.invoice.update({ where: { id: f.invoiceId }, data: customerPatch });
    await tx.auditLog.create({
      data: {
        userId,
        action: "UPDATE",
        module: "Invoice",
        recordId: f.invoiceId,
        oldValue: { customerNameSnapshot: inv.customerNameSnapshot },
        newValue: { invoiceNumber: inv.invoiceNumber, customerNameSnapshot: header.customerNameSnapshot, note: `${note} (ใบพิมพ์แล้ว — เปลี่ยนเฉพาะข้อมูลลูกค้า รายการ/ยอดคงเดิม)` },
      },
    });
  }

  for (const a of plan.assignments) {
    const inv = byId.get(a.invoiceId)!;
    const chunk = buildChunk(a.lines, group.discountPct, forcedPct);
    await tx.invoice.update({
      where: { id: a.invoiceId },
      data: {
        ...customerPatch,
        grossAmount: chunk.gross,
        discountPct: group.discountPct,
        discountAmount: chunk.discountAmount,
        applyDiscount: header.applyDiscount,
        netBeforeVat: chunk.net,
        grandTotal: chunk.net,
      },
    });
    const sync = await syncInvoiceSheets(tx, { id: a.invoiceId, invoiceNumber: inv.invoiceNumber, productTypeCode: group.productTypeCode }, chunk.payloads);
    await tx.auditLog.create({
      data: {
        userId,
        action: "UPDATE",
        module: "Invoice",
        recordId: a.invoiceId,
        oldValue: { grandTotal: inv.grandTotal.toString(), customerNameSnapshot: inv.customerNameSnapshot },
        newValue: {
          invoiceNumber: inv.invoiceNumber,
          grandTotal: chunk.net.toString(),
          lineCount: a.lines.length,
          sheetNumbers: sync.sheetNumbers,
          ...(sync.voidedNumbers.length ? { voidedSheetNumbers: sync.voidedNumbers, releasedSheetNumbers: sync.releasedNumbers } : {}),
          note,
        },
      },
    });
    result.updated.push(inv.invoiceNumber);
  }

  for (const lines of plan.creates) {
    const chunk = buildChunk(lines, group.discountPct, forcedPct);
    const seq = await getNextSeq(docType, header.period, tx);
    const invoiceNumber = formatDocNumber(docType, header.period, seq, 4);
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        parentOrderId: header.orderId,
        invoiceDate: header.orderDate,
        productTypeCode: group.productTypeCode,
        ...customerPatch,
        placeToDelivery: header.placeToDelivery,
        grossAmount: chunk.gross,
        discountPct: group.discountPct,
        discountAmount: chunk.discountAmount,
        applyDiscount: header.applyDiscount,
        netBeforeVat: chunk.net,
        vatPct: new Decimal(0),
        vatAmount: new Decimal(0),
        grandTotal: chunk.net,
        status: "CONFIRMED",
        createdById: userId,
      },
    });
    const sync = await syncInvoiceSheets(tx, invoice, chunk.payloads);
    await tx.auditLog.create({
      data: {
        userId,
        action: "CREATE",
        module: "Invoice",
        recordId: invoice.id,
        newValue: { invoiceNumber, parentOrderId: header.orderId, productTypeCode: group.productTypeCode, lineCount: lines.length, sheetNumbers: sync.sheetNumbers, note },
      },
    });
    result.created.push(invoiceNumber);
  }

  for (const c of plan.cancels) {
    const inv = byId.get(c.invoiceId)!;
    await tx.invoice.update({ where: { id: c.invoiceId }, data: { status: "CANCELLED" } });
    await tx.auditLog.create({
      data: {
        userId,
        action: "CANCEL",
        module: "Invoice",
        recordId: c.invoiceId,
        oldValue: { status: inv.status },
        newValue: { status: "CANCELLED", reason: `ไม่เหลือรายการให้ใบนี้หลังจัดใบใหม่ (${note})` },
      },
    });
    result.cancelled.push(inv.invoiceNumber);
  }

  return result;
}

/** กลุ่มส่วนลดที่ไม่เหลือรายการเลย → ยกเลิกทุกใบ Active ของกลุ่ม (รวมใบพิมพ์แล้ว — กติกา R11
 * เดิม: "กลุ่มไหนลบออกหมด เลข INV ก็ลบไป" เลขคงเป็นสถานะยกเลิกถาวร ไม่นำกลับมาใช้) */
export async function cancelVanishedGroupInvoices(
  tx: Prisma.TransactionClient,
  invoices: { id: string; invoiceNumber: string; status: string }[],
  userId: string,
  reason: string
): Promise<string[]> {
  const cancelled: string[] = [];
  for (const inv of invoices) {
    await tx.invoice.update({ where: { id: inv.id }, data: { status: "CANCELLED" } });
    await tx.auditLog.create({
      data: { userId, action: "CANCEL", module: "Invoice", recordId: inv.id, oldValue: { status: inv.status }, newValue: { status: "CANCELLED", reason } },
    });
    cancelled.push(inv.invoiceNumber);
  }
  return cancelled;
}

/** Include สำหรับอ่านใบ Active เดิมของออเดอร์ให้ครบฟิลด์ที่ Reconcile ต้องใช้ */
export const EXISTING_INVOICE_SELECT = {
  id: true,
  invoiceNumber: true,
  status: true,
  printedAt: true,
  discountPct: true,
  grandTotal: true,
  customerNameSnapshot: true,
  productTypeCode: true,
  sheets: { where: { voidedAt: null, numberReleased: false }, select: { printedAt: true } },
  items: {
    orderBy: { lineNo: "asc" as const },
    select: {
      productId: true,
      skuSnapshot: true,
      productNameSnapshot: true,
      sizeSnapshot: true,
      quantity: true,
      unitSnapshot: true,
      unitPriceSnapshot: true,
      grossAmount: true,
    },
  },
} as const;
