import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { parseDocNumber, tryReleaseSeq } from "@/lib/running-number-reclaim";
import { paginateRows, DOC_CAPACITY_APPROVED, type PageCapacity } from "@/lib/print-pagination";

// ==========================================================================
// Owner Approve (2026-09-02) — Physical Sheet Engine (Option B): จุดเดียวที่ตัดสินว่า
// รายการของ Invoice ตกแผ่นไหน + แผ่นไหนได้เลขอะไร — ใช้ร่วมกันทั้ง 3 จุดที่สร้าง/แก้
// Invoice (confirmOrder / editConfirmedOrder / changeOrderCustomer ใน orders/actions.ts)
// เพื่อให้กติกาเลขแผ่นเหมือนกันเป๊ะทุกทาง — ดู Requirement เต็มที่ model InvoiceSheet
//
// หลักการสำคัญ: การแบ่งแผ่นถูกตัดสิน "ครั้งเดียวตอนเขียนเอกสาร" แล้ว Persist ลง DB
// (sheetId/lineNo บน InvoiceItem) — หน้า Print แค่อ่านตามที่ Persist ไว้ ไม่คำนวณใหม่
// (Document Snapshot ของรูปแบบกระดาษจริง — เอกสารเก่าไม่มีทางเปลี่ยนหน้าตาแม้ความจุ
// ต่อแผ่นจะถูกปรับในอนาคต)
// ==========================================================================

export const INVOICE_SHEET_CAPACITY: PageCapacity = DOC_CAPACITY_APPROVED.INVOICE!;

/** แผนแบ่งแผ่นจากรายการเรียงลำดับแล้ว — Pure Function (Reuse paginateRows + ความจุ
 * Owner-approved 17/14/14 ตัวเดียวกับหน้า Print เป๊ะ) */
export function planSheetSplit<T>(lines: T[]): T[][] {
  return paginateRows(lines, INVOICE_SHEET_CAPACITY);
}

export type SheetSyncResult = {
  /** เลขแผ่น Active ทั้งหมดหลัง Sync เรียงตาม sheetNo */
  sheetNumbers: string[];
  /** เลขแผ่นที่ถูกยุบรอบนี้ (voidedAt ใหม่) */
  voidedNumbers: string[];
  /** เลขแผ่นที่ Reclaim สำเร็จจริงรอบนี้ (Subset ของ voidedNumbers) */
  releasedNumbers: string[];
};

type InvoiceItemPayload = Omit<Prisma.InvoiceItemCreateManyInput, "id" | "invoiceId" | "sheetId" | "lineNo">;

/** Owner Final Guard (2026-09-02) — Error Prefix ของการ Block แก้ไขที่กระทบแผ่นพิมพ์แล้ว
 * — Caller (editConfirmedOrder/changeOrderCustomer) จับ Prefix นี้เพื่อคืนข้อความจริงให้
 * ผู้ใช้แทน Error ทั่วไป (Transaction Rollback ทั้งก้อน ไม่มีอะไรถูกเขียนเลย) */
export const PRINTED_SHEET_BLOCK = "PRINTED_SHEET_IMMUTABLE";

const D = (v: unknown) => new Decimal(v as Decimal.Value);

/** เทียบ Payload บรรทัดใหม่กับแถวจริงใน DB — ทุกฟิลด์ที่ปรากฏ/มีผลบนกระดาษ (สินค้า/ชื่อ/
 * ขนาด/จำนวน/หน่วย/ราคา/ส่วนลดที่จัดสรรแล้ว/ยอดสุทธิ) — จงใจ "ไม่" เทียบ statDiscountAmount
 * (ค่าวิเคราะห์ภายใน ไม่เคยพิมพ์บนกระดาษ — แผ่น Freeze คงค่าเดิมไว้ตามหลัก Immutable) */
export function invoiceItemPayloadMatches(
  payload: InvoiceItemPayload,
  item: {
    productId: string;
    skuSnapshot: string;
    productNameSnapshot: string;
    productTypeSnapshot: string;
    sizeSnapshot: string | null;
    quantity: unknown;
    unitSnapshot: string;
    unitPriceSnapshot: unknown;
    grossAmount: unknown;
    discountAmount: unknown;
    netAmount: unknown;
  }
): boolean {
  return (
    payload.productId === item.productId &&
    payload.skuSnapshot === item.skuSnapshot &&
    payload.productNameSnapshot === item.productNameSnapshot &&
    payload.productTypeSnapshot === item.productTypeSnapshot &&
    (payload.sizeSnapshot ?? null) === item.sizeSnapshot &&
    payload.unitSnapshot === item.unitSnapshot &&
    D(payload.quantity).equals(D(item.quantity)) &&
    D(payload.unitPriceSnapshot).equals(D(item.unitPriceSnapshot)) &&
    D(payload.grossAmount).equals(D(item.grossAmount)) &&
    D(payload.discountAmount).equals(D(item.discountAmount)) &&
    D(payload.netAmount).equals(D(item.netAmount))
  );
}

/**
 * Sync แผ่นของ Invoice ให้ตรงกับรายการชุดใหม่ — ฟังก์ชันนี้เป็นเจ้าของการลบ/สร้าง
 * InvoiceItem เองทั้งหมด (Owner Final Guard 2026-09-02: ห้าม Caller deleteMany ก่อน —
 * แถวของแผ่นที่พิมพ์แล้วต้องรอด id/lineNo/เนื้อหาเดิมครบ ลบเฉพาะส่วนหลัง Prefix ที่ Freeze):
 *
 * - สร้างใหม่ (ยังไม่มีแผ่น): แผ่น 1 = เลขใบหลักเอง, แผ่นถัดไปดึงเลขใหม่จาก Sequence
 *   เดิมของ docType+period ของใบหลัก (Parse จากเลขใบหลักตรงๆ — เลขแผ่นอยู่ Block
 *   เดือนเดียวกับใบหลักเสมอแม้แก้ข้ามเดือน)
 * - แก้ไข: รักษาเลขแผ่นเดิมตามลำดับ (แผ่นที่ i ยังใช้เลขเดิมของตำแหน่งนั้น — ห้าม
 *   Renumber) / แผ่นไม่พอ → ดึงเลขใหม่ต่อท้าย / แผ่นเกิน → Void แผ่นท้าย (เก็บแถวเป็น
 *   ประวัติเสมอ) และ Reclaim เลขได้เฉพาะเมื่อ "ไม่มีแผ่นไหนในชุดเคย PRINTED" + เข้า
 *   เงื่อนไข tryReleaseSeq เดิม (เลขท้ายสุดของ Sequence — CAS) — ไล่ปล่อยจากแผ่นท้าย
 *   ก่อนเสมอ (Cascade ได้ถ้าติดกัน) ห้ามดึงเลขกลาง — มีแผ่น PRINTED แล้ว = Freeze
 *   ทั้งชุด (Void ได้แต่เลขไม่ถูกปล่อยคืนเด็ดขาด)
 */
export async function syncInvoiceSheets(
  tx: Prisma.TransactionClient,
  invoice: { id: string; invoiceNumber: string; productTypeCode: string },
  itemsData: InvoiceItemPayload[]
): Promise<SheetSyncResult> {
  const docType = `INV-${invoice.productTypeCode}`;
  // เลขใบหลักมาจาก formatDocNumber เสมอ — Parse ไม่ได้ = ข้อมูลผิดรูปผิดปกติจริงๆ
  // Fallback เป็นงวดปัจจุบันเพื่อไม่ Block งาน (เลขแผ่นใหม่จะไปอยู่งวดปัจจุบันแทน)
  const period = parseDocNumber(docType, invoice.invoiceNumber)?.period ?? currentPeriod(new Date());

  const existing = await tx.invoiceSheet.findMany({
    where: { invoiceId: invoice.id, voidedAt: null, numberReleased: false },
    orderBy: { sheetNo: "asc" },
  });
  const anyPrintedSheet = existing.some((s) => s.printedAt != null);

  // ==========================================================================
  // Owner Final Guard (2026-09-02) — PRINTED Physical Sheet = Immutable Historical
  // Document: กระดาษที่พิมพ์ออกไปแล้วต้องตรงกับข้อมูลในระบบตลอดไป — Freeze ครอบคลุม
  // "เลข + เนื้อหา + ยอด + lineNo + บทบาท Final/Non-final" ไม่ใช่แค่เลข
  //
  // กติกา: ให้ k = ตำแหน่งแผ่นพิมพ์แล้วที่ "ลึกที่สุด" — ขอบเขตแผ่น 1..k ถูก "ตรึงตาม
  // ของจริงใน DB" (ห้ามวางแผนแบ่งใหม่ทั้งเอกสาร — Global Re-plan จะเลื่อนขอบแผ่นกลางที่
  // พิมพ์แล้วทันทีเมื่อจำนวนรายการเปลี่ยน) — รายการชุดใหม่ต้องมีส่วนหัวที่ตรงกับเนื้อหา
  // แผ่น 1..k "ทุกฟิลด์ทุกบรรทัดตามลำดับเดิมเป๊ะ" (รวมแผ่นยังไม่พิมพ์ที่ประกบก่อน k ด้วย
  // เพราะ lineNo ของแผ่นพิมพ์แล้วห้ามเลื่อน) — ส่วนที่เหลือ (หาง) ถูกวางแผนแบ่งแยกต่างหาก
  // ด้วยกติกาความจุเดิม แล้ว Reconcile เฉพาะหาง — ไม่ตรง = BLOCK ทั้ง Transaction พร้อม
  // เหตุผล (ห้ามแก้เงียบๆ แม้จะรักษาเลขไว้ได้)
  //
  // บทบาทแผ่นพิมพ์แล้วห้ามเปลี่ยนทั้งสองทิศ:
  //   - แผ่นจบพิมพ์แล้ว (กระดาษมี Grand Total/Full Footer) → ห้ามมีหางเพิ่ม (จะกลายเป็น
  //     แผ่นกลางย้อนหลัง)
  //   - แผ่นกลางพิมพ์แล้ว (กระดาษมีแค่รวมหน้านี้+Signature) → ห้ามกลายเป็นแผ่นจบ (หาง
  //     ต้องเหลืออย่างน้อย 1 แผ่นเสมอ)
  // ==========================================================================
  let pages: InvoiceItemPayload[][];
  let frozenPrefixPages = 0;
  if (!anyPrintedSheet) {
    pages = planSheetSplit(itemsData);
  } else {
    const deepestPrinted = Math.max(...existing.filter((s) => s.printedAt != null).map((s) => s.sheetNo));
    const deepestPrintedIsFinal = deepestPrinted === existing.length;

    const existingItems = await tx.invoiceItem.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { lineNo: "asc" },
    });

    // ตรึงขอบแผ่น Prefix ตามของจริง แล้วเทียบเนื้อหาทีละแผ่นทีละบรรทัด
    const prefixChunks: InvoiceItemPayload[][] = [];
    let cursor = 0;
    for (let i = 0; i < deepestPrinted; i++) {
      const sheetItems = existingItems.filter((it) => it.sheetId === existing[i].id);
      const chunk = itemsData.slice(cursor, cursor + sheetItems.length);
      const mismatch =
        chunk.length !== sheetItems.length ||
        sheetItems.some((it, idx) => !invoiceItemPayloadMatches(chunk[idx], it));
      if (mismatch) {
        throw new Error(
          `${PRINTED_SHEET_BLOCK}:แก้ไขไม่ได้ — การแก้นี้กระทบเนื้อหา/ยอด/ลำดับบรรทัดของแผ่นที่พิมพ์แล้ว ${existing[i].sheetNumber}${existing[i].printedAt ? "" : " (แผ่นนี้อยู่ก่อนแผ่นที่พิมพ์แล้ว — แก้แล้วลำดับบรรทัดของแผ่นพิมพ์แล้วจะเลื่อน)"} — แก้ได้เฉพาะส่วนที่อยู่หลังแผ่นที่พิมพ์แล้วเท่านั้น หรือยกเลิกเอกสารแล้วออกใหม่`
        );
      }
      prefixChunks.push(chunk);
      cursor += sheetItems.length;
    }

    const tailItems = itemsData.slice(cursor);
    if (deepestPrintedIsFinal && tailItems.length > 0) {
      throw new Error(
        `${PRINTED_SHEET_BLOCK}:แก้ไขไม่ได้ — แผ่นจบ ${existing[existing.length - 1].sheetNumber} ถูกยืนยันพิมพ์แล้ว (มี Grand Total/Full Footer บนกระดาษ) การเพิ่มรายการจะเปลี่ยนบทบาทแผ่นจบย้อนหลัง — ต้องยกเลิกเอกสารแล้วออกใหม่แทน`
      );
    }
    if (!deepestPrintedIsFinal && tailItems.length === 0) {
      throw new Error(
        `${PRINTED_SHEET_BLOCK}:แก้ไขไม่ได้ — แผ่นกลางที่พิมพ์แล้ว ${existing[deepestPrinted - 1].sheetNumber} จะกลายเป็นแผ่นจบย้อนหลัง (กระดาษที่พิมพ์ไว้ไม่มี Grand Total) — ต้องเหลือรายการหลังแผ่นนั้นอย่างน้อย 1 แผ่น หรือยกเลิกเอกสารแล้วออกใหม่`
      );
    }

    // หางวางแผนแบ่งแยกต่างหากด้วยความจุเดิม (min-final ≥3 ยืมได้เฉพาะภายในหางด้วยกันเอง —
    // ห้ามยืมจากแผ่นพิมพ์แล้ว จึงอาจมีแผ่นจบสั้นกว่ากติกาปกติได้ในกรณีบีบบังคับนี้)
    pages = tailItems.length > 0 ? [...prefixChunks, ...paginateRows(tailItems, INVOICE_SHEET_CAPACITY)] : prefixChunks;
    frozenPrefixPages = deepestPrinted;
  }

  // (0) ลบเฉพาะรายการที่ต้องสร้างใหม่ — Prefix ที่ Freeze ไว้ไม่ถูกแตะเลย (แถวเดิม id เดิม
  // lineNo เดิม) — ไม่มีแผ่นพิมพ์แล้ว = ลบทั้งชุดแล้วสร้างใหม่ (พฤติกรรมเดิม)
  const frozenSheetIds = existing.slice(0, frozenPrefixPages).map((s) => s.id);
  await tx.invoiceItem.deleteMany({
    where:
      frozenPrefixPages > 0
        ? { invoiceId: invoice.id, OR: [{ sheetId: { notIn: frozenSheetIds } }, { sheetId: null }] }
        : { invoiceId: invoice.id },
  });

  // (1) แผ่นตามตำแหน่ง: Reuse เลขเดิม / สร้างใหม่ต่อท้าย
  const sheetIds: string[] = [];
  const sheetNumbers: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (i < existing.length) {
      // ตำแหน่งเดิม เลขเดิม — อัปเดตแค่ sheetNo ให้ Contiguous (ปกติไม่เปลี่ยนอยู่แล้ว)
      if (existing[i].sheetNo !== i + 1) {
        await tx.invoiceSheet.update({ where: { id: existing[i].id }, data: { sheetNo: i + 1 } });
      }
      sheetIds.push(existing[i].id);
      sheetNumbers.push(existing[i].sheetNumber);
    } else {
      const sheetNumber =
        i === 0 ? invoice.invoiceNumber : formatDocNumber(docType, period, await getNextSeq(docType, period, tx), 4);
      const created = await tx.invoiceSheet.create({
        data: { invoiceId: invoice.id, sheetNo: i + 1, sheetNumber },
      });
      sheetIds.push(created.id);
      sheetNumbers.push(sheetNumber);
    }
  }

  // (2) สร้าง InvoiceItem เฉพาะส่วนหลัง Prefix ที่ Freeze — lineNo ต่อเนื่องจากของเดิมเป๊ะ
  // (Prefix ถือ lineNo 1..N ของตัวเองอยู่แล้วเพราะเนื้อหาตรงกันทุกบรรทัดตามที่ตรวจข้างบน)
  let lineNo = pages.slice(0, frozenPrefixPages).reduce((s, p) => s + p.length, 0) + 1;
  for (let i = frozenPrefixPages; i < pages.length; i++) {
    await tx.invoiceItem.createMany({
      data: pages[i].map((d) => ({ ...d, invoiceId: invoice.id, sheetId: sheetIds[i], lineNo: lineNo++ })),
    });
  }

  // (3) แผ่นท้ายที่เกิน: Void เสมอ (เก็บประวัติ) + Reclaim ตามเงื่อนไข — ไล่จากท้ายก่อน
  const voidedNumbers: string[] = [];
  const releasedNumbers: string[] = [];
  const trailing = existing.slice(pages.length);
  for (const sheet of [...trailing].reverse()) {
    let released = false;
    if (!anyPrintedSheet) {
      const parsed = parseDocNumber(docType, sheet.sheetNumber);
      if (parsed) released = await tryReleaseSeq(docType, parsed.period, parsed.seq, tx);
    }
    await tx.invoiceSheet.update({
      where: { id: sheet.id },
      data: { voidedAt: new Date(), ...(released ? { numberReleased: true } : {}) },
    });
    voidedNumbers.push(sheet.sheetNumber);
    if (released) releasedNumbers.push(sheet.sheetNumber);
  }

  return { sheetNumbers, voidedNumbers, releasedNumbers };
}

/** สถานะพิมพ์สรุปของใบหลักจากแผ่น Active — Owner: UNPRINTED / PARTIAL / PRINTED
 * (ใบเก่าที่ไม่มีแผ่นเลยให้ Derive จากสถานะใบหลักเดิมตรงๆ ที่จุดเรียกใช้) */
export function deriveSheetPrintState(sheets: { printedAt: Date | null; voidedAt: Date | null }[]): "UNPRINTED" | "PARTIAL" | "PRINTED" {
  const active = sheets.filter((s) => s.voidedAt == null);
  if (active.length === 0) return "UNPRINTED";
  const printed = active.filter((s) => s.printedAt != null).length;
  if (printed === 0) return "UNPRINTED";
  return printed === active.length ? "PRINTED" : "PARTIAL";
}

/**
 * ปล่อยเลขทั้งหมดของ Invoice ตอนยกเลิก (ใบหลัก + ทุกแผ่น) ตามกติกา Reclaim เดิมเป๊ะ:
 * เข้าเงื่อนไขเฉพาะ "ไม่เคยมีแผ่นไหน/ใบหลัก PRINTED เลย" (Downstream ถูก Guard ที่ Caller
 * ก่อนถึงจุดนี้แล้วเสมอ — เหมือน cancelInvoice/cancelOrder เดิม) — ไล่ปล่อยจากเลขมาก
 * ไปน้อย (แผ่นท้ายก่อน ปิดท้ายด้วยเลขใบหลัก) ให้ Cascade ได้ครบเมื่อเป็นเลขท้ายติดกัน —
 * เลขที่ปล่อยไม่สำเร็จ (ไม่ใช่ท้าย Sequence) คงถูกยึดตามเดิม ห้ามดึงกลับ
 * ใบเก่าไม่มีแผ่น = ปล่อยเฉพาะเลขใบหลัก (พฤติกรรมเดิมทุกประการ)
 */
export async function releaseInvoiceNumbersOnCancel(
  tx: Prisma.TransactionClient,
  invoice: { id: string; invoiceNumber: string; productTypeCode: string; printedAt: Date | null }
): Promise<{ releasedNumbers: string[] }> {
  const docType = `INV-${invoice.productTypeCode}`;
  const sheets = await tx.invoiceSheet.findMany({
    where: { invoiceId: invoice.id, numberReleased: false },
  });
  const anyPrinted = invoice.printedAt != null || sheets.some((s) => s.printedAt != null);
  if (anyPrinted) return { releasedNumbers: [] };

  // รวมทุกเลขที่ใบนี้ถือ: แถวแผ่นทั้งหมด (แผ่น 1 ถือเลขเดียวกับใบหลัก) — ใบเก่าไม่มีแผ่น
  // ใช้เลขใบหลักตรงๆ
  const holders =
    sheets.length > 0
      ? sheets.map((s) => ({ sheetId: s.id as string | null, number: s.sheetNumber }))
      : [{ sheetId: null as string | null, number: invoice.invoiceNumber }];

  const parsedHolders = holders
    .map((h) => ({ ...h, parsed: parseDocNumber(docType, h.number) }))
    .filter((h): h is typeof h & { parsed: NonNullable<ReturnType<typeof parseDocNumber>> } => h.parsed != null)
    .sort((a, b) => (a.parsed.period === b.parsed.period ? b.parsed.seq - a.parsed.seq : b.parsed.period.localeCompare(a.parsed.period)));

  const releasedNumbers: string[] = [];
  for (const holder of parsedHolders) {
    const released = await tryReleaseSeq(docType, holder.parsed.period, holder.parsed.seq, tx);
    if (!released) continue;
    releasedNumbers.push(holder.number);
    if (holder.sheetId) {
      await tx.invoiceSheet.update({ where: { id: holder.sheetId }, data: { numberReleased: true } });
    }
    if (holder.number === invoice.invoiceNumber) {
      await tx.invoice.updateMany({ where: { id: invoice.id }, data: { numberReleased: true } });
    }
  }
  return { releasedNumbers };
}
