"use client";

import { useState } from "react";
import { PrintAmountWordsRemark } from "./print-amount-words-remark";
import { PrintPageLabel, type PrintBodyPagination } from "./print-pagination-parts";
import type { VatPageSummary } from "@/lib/print-pagination";

function money(n: unknown) {
  return Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type QuotationPrintItem = {
  id: string;
  productNameSnapshot: string | null;
  sizeSnapshot: string | null;
  quantity: unknown;
  unitSnapshot: string | null;
  unitPriceSnapshot: unknown;
  discountAmount: unknown;
  netAmount: unknown;
};

// R6 Phase D — showDiscount (เดิม Presentation Toggle อิสระ) ถูกถอดออกแล้ว: ต้อง
// สะท้อน applyDiscount (Calculation Snapshot ของเอกสารจริง) เท่านั้น ไม่ใช่ Toggle
// ที่ผู้ใช้กดเอง — showVatBreakdown ยังคงเป็น Toggle Presentation ล้วนๆ ตามเดิม (VAT
// เป็น Inclusive อยู่แล้ว การซ่อน/โชว์ Breakdown ไม่เปลี่ยนยอดใดๆ จึงอนุมัติให้คงไว้)
//
// R8 — Document Pagination: เหมือน InvoicePrintBody ทุกประการ (ดูคำอธิบายที่นั่น) —
// Summary ประจำหน้าคำนวณจาก Snapshot รายการของหน้านั้น (VAT ต่อหน้าถอดด้วย extractVat
// เดิมฝั่ง Server — ดู computeQuotationPageSummary) — Toggle แสดง VAT Breakdown ใช้ร่วม
// ทุกหน้า (State เดียว)
export function QuotationPrintBody({
  items,
  note,
  amountInWords,
  grossAmount,
  discountAmount,
  applyDiscount,
  vatMode,
  vatRateSnapshot,
  netBeforeVat,
  vatAmount,
  grandTotal,
  pagination,
}: {
  items: QuotationPrintItem[];
  note: string | null;
  amountInWords: string;
  grossAmount: unknown;
  discountAmount: unknown;
  /** Snapshot ของ Quotation.applyDiscount — คุมว่าแสดงคอลัมน์/แถวส่วนลดหรือไม่ */
  applyDiscount: boolean;
  vatMode: string;
  vatRateSnapshot: unknown;
  netBeforeVat: unknown;
  vatAmount: unknown;
  grandTotal: unknown;
  pagination?: PrintBodyPagination<QuotationPrintItem, VatPageSummary>;
}) {
  const showDiscount = applyDiscount;
  // Phase R1 — showVatBreakdown: Toggle การแสดงผลล้วนๆ (print-time, ไม่ persist ลง DB)
  // ค่าเริ่มต้น = แสดง (true) เพื่อรักษาพฤติกรรมเดิมของเอกสารทุกใบ ปิด/เปิด Toggle นี้
  // ไม่มีผลต่อ Grand Total ที่แสดงเลย (ซ่อนแค่ 2 แถวรายละเอียด "มูลค่าก่อน VAT"/"VAT %")
  // ใช้ได้เฉพาะตอน hasVat เท่านั้น
  const [showVatBreakdown, setShowVatBreakdown] = useState(true);
  const hasVat = vatMode === "STANDARD";

  const vatToggle = hasVat && (
    <div className="print:hidden flex items-center gap-4 mb-2 text-sm">
      <div className="flex items-center gap-1.5">
        <input
          id="show-vat-breakdown"
          type="checkbox"
          checked={showVatBreakdown}
          onChange={(e) => setShowVatBreakdown(e.target.checked)}
        />
        <label htmlFor="show-vat-breakdown">แสดงรายละเอียด VAT</label>
      </div>
    </div>
  );

  const itemsTable = (pageItems: QuotationPrintItem[], startIndex: number) => (
    <table className="print-table w-full mb-[length:var(--print-block-gap)] text-[length:var(--print-body-size)]">
      <thead>
        <tr className="border-b">
          <th className="text-left py-[length:var(--print-row-padding)] w-8">No.</th>
          <th className="text-left py-[length:var(--print-row-padding)]">รายการ</th>
          <th className="text-left py-[length:var(--print-row-padding)]">ขนาด</th>
          <th className="text-right py-[length:var(--print-row-padding)]">จำนวน</th>
          <th className="text-right py-[length:var(--print-row-padding)]">ราคา/หน่วย</th>
          {showDiscount && <th className="text-right py-[length:var(--print-row-padding)]">ส่วนลด</th>}
          <th className="text-right py-[length:var(--print-row-padding)]">จำนวนเงิน</th>
        </tr>
      </thead>
      <tbody>
        {pageItems.map((item, i) => (
          <tr key={item.id} className="border-b border-dashed">
            <td className="py-[length:var(--print-row-padding)]">{startIndex + i + 1}</td>
            <td className="py-[length:var(--print-row-padding)]">{item.productNameSnapshot}</td>
            <td className="py-[length:var(--print-row-padding)]">{item.sizeSnapshot ?? ""}</td>
            <td className="text-right py-[length:var(--print-row-padding)]">
              {Number(item.quantity)} {item.unitSnapshot}
            </td>
            <td className="text-right py-[length:var(--print-row-padding)]">{money(item.unitPriceSnapshot)}</td>
            {showDiscount && <td className="text-right py-[length:var(--print-row-padding)]">{money(item.discountAmount)}</td>}
            <td className="text-right py-[length:var(--print-row-padding)]">{money(item.netAmount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const summaryRows = (
    vals: { gross: unknown; discount: unknown; netBeforeVat: unknown; vatAmount: unknown; net: unknown },
    netLabel: string
  ) => (
    <div className="text-[length:var(--print-body-size)] space-y-1">
      <div className="flex justify-between">
        <span>รวม / Total</span>
        <span>{money(vals.gross)}</span>
      </div>
      {showDiscount && (
        <div className="flex justify-between">
          <span>ส่วนลด / Discount</span>
          <span>{money(vals.discount)}</span>
        </div>
      )}
      {hasVat && showVatBreakdown && (
        <>
          <div className="flex justify-between">
            <span>มูลค่าก่อน VAT</span>
            <span>{money(vals.netBeforeVat)}</span>
          </div>
          <div className="flex justify-between">
            <span>ภาษีมูลค่าเพิ่ม / VAT {Number(vatRateSnapshot)}%</span>
            <span>{money(vals.vatAmount)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between font-semibold border-t pt-1">
        <span>{netLabel}</span>
        <span>{money(vals.net)}</span>
      </div>
    </div>
  );

  const docNetLabel = hasVat ? "Grand Total" : "สุทธิ / Net Amount";
  const docSummaryBlock = (
    <div className="border rounded p-2 grid grid-cols-2 gap-4 mb-[length:var(--print-block-gap)]">
      <PrintAmountWordsRemark amountInWords={amountInWords} remark={note} />
      {summaryRows(
        { gross: grossAmount, discount: discountAmount, netBeforeVat, vatAmount, net: grandTotal },
        docNetLabel
      )}
    </div>
  );

  if (!pagination) {
    return (
      <>
        {vatToggle}
        {itemsTable(items, 0)}
        <div className="flex-1" />
        <div className="print-keep-together">{docSummaryBlock}</div>
      </>
    );
  }

  const pageCount = pagination.pages.length;
  let cursor = 0;
  return (
    <>
      {vatToggle}
      {pagination.pages.map((page, idx) => {
        const startIndex = cursor;
        cursor += page.items.length;
        const isLast = idx === pageCount - 1;
        return (
          <section key={idx} className="print-doc-page">
            {pagination.header}
            <PrintPageLabel pageNo={idx + 1} pageCount={pageCount} />
            {itemsTable(page.items, startIndex)}
            <div className="flex-1" />
            <div className="print-keep-together">
              {pageCount > 1 && (
                <div className="border rounded p-2 mb-[length:var(--print-block-gap)]">
                  <div className="text-[length:var(--print-body-size)] text-gray-600 mb-1">
                    รวมหน้านี้ (หน้า {idx + 1}/{pageCount})
                  </div>
                  {summaryRows(page.summary, hasVat ? "รวมหน้านี้ (รวม VAT)" : "สุทธิหน้านี้")}
                </div>
              )}
              {isLast && docSummaryBlock}
              {isLast && pagination.signature}
            </div>
          </section>
        );
      })}
    </>
  );
}
