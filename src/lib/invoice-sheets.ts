import type { Prisma } from "@prisma/client";
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

/**
 * Sync แผ่นของ Invoice ให้ตรงกับรายการชุดใหม่ (Caller ต้องลบ InvoiceItem เดิมก่อนเสมอ
 * ถ้าเป็นการแก้ไข — ฟังก์ชันนี้เป็นคนสร้าง InvoiceItem ชุดใหม่เองพร้อม sheetId/lineNo):
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

  const pages = planSheetSplit(itemsData);
  const existing = await tx.invoiceSheet.findMany({
    where: { invoiceId: invoice.id, voidedAt: null, numberReleased: false },
    orderBy: { sheetNo: "asc" },
  });
  const anyPrintedSheet = existing.some((s) => s.printedAt != null);

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

  // (2) สร้าง InvoiceItem ชุดใหม่พร้อม sheetId + lineNo ถาวร (Caller ลบชุดเก่าแล้ว)
  let lineNo = 1;
  for (let i = 0; i < pages.length; i++) {
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
