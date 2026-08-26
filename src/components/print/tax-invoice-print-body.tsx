import { PrintAmountWordsRemark } from "./print-amount-words-remark";
import { PrintSignatureBlock } from "./print-signature-block";
import { PrintPageLabel, type PrintBodyPagination } from "./print-pagination-parts";
import type { TaxInvoicePageSummary } from "@/lib/print-pagination";

function money(n: unknown) {
  return Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type TaxInvoicePrintItem = {
  id: string;
  description: string;
  size: string | null;
  quantity: unknown;
  unit: string;
  unitPrice: unknown;
  amount: unknown;
  discountAmount?: unknown;
};

// R6 Phase E — แยกออกมาจากเดิมที่เคย Inline อยู่ในหน้า Print ตรงๆ (tax-invoices/[id]/
// print/page.tsx) เพื่อให้ Visual Designer เรียก Component เดียวกันกับหน้า Print จริง
// เป๊ะ (Single Rendering Source — ไม่มีการ Copy JSX ซ้ำ)
//
// Phase H — Summary เรียงตามลำดับที่ Owner กำหนด: รวมเป็นเงิน → หักส่วนลด → ยอดรวม
// หลังหักส่วนลด → มูลค่าสินค้าก่อน VAT → VAT → ยอดสุทธิ — แถว "มูลค่าสินค้าก่อน VAT"
// (ฐานภาษี) คงไว้เพราะเป็นสาระสำคัญของใบกำกับภาษี (มูลค่า + VAT = ยอดสุทธิ ตรวจทาน
// ได้บนเอกสาร) ตาม Pattern เดียวกับ Quotation ที่แสดง "มูลค่าก่อน VAT" อยู่แล้ว —
// Fresh UAT Fix: เอกสารไม่มีส่วนลด → ซ่อนแถวส่วนลด/หลังหักส่วนลด (ดู showDiscount
// ด้านล่าง) — vatPct มาจาก Snapshot ของเอกสาร
// (อ่านจาก VAT configuration ตอนสร้าง) ไม่ Hardcode 7 ทั้ง Label และการคำนวณ —
// grossAmount เป็น null ได้ (ใบเก่าก่อน Phase H ที่ไม่มีแนวคิดส่วนลด): Fallback =
// netAmount ซึ่งถูกต้องตามความจริงของใบเก่า (ส่วนลด 0) โดยไม่ Backfill ข้อมูล
//
// R8 — Document Pagination: เหมือน InvoicePrintBody ทุกประการ (ดูคำอธิบายที่นั่น) —
// VAT ต่อหน้าถอดด้วย extractVat เดิมฝั่ง Server (computeTaxInvoicePageSummary)
export function TaxInvoicePrintBody({
  items,
  grossAmount,
  discountAmount,
  valueAmount,
  vatPct,
  vatAmount,
  netAmount,
  amountInWords,
  footerNote,
  pagination,
}: {
  items: TaxInvoicePrintItem[];
  grossAmount?: unknown;
  discountAmount?: unknown;
  valueAmount: unknown;
  vatPct: unknown;
  vatAmount: unknown;
  netAmount: unknown;
  amountInWords: string;
  footerNote?: string;
  pagination?: PrintBodyPagination<TaxInvoicePrintItem, TaxInvoicePageSummary>;
}) {
  const subtotal = grossAmount ?? netAmount;
  const discount = discountAmount ?? 0;
  // Fresh UAT Fix — เอกสารที่ไม่มีส่วนลด (รวมใบเก่าก่อน Phase H): ซ่อนทั้งคอลัมน์ส่วนลด
  // ต่อบรรทัดและแถว "หักส่วนลด/ยอดรวมหลังหักส่วนลด" ใน Summary → เหลือ Subtotal →
  // มูลค่าก่อน VAT → VAT → Net ตามที่ Owner กำหนด — Presentation เท่านั้น ตัวเลข/สูตร
  // ทุกค่าเหมือนเดิมเป๊ะ (เอกสารมีส่วนลดยังแสดงครบทุกแถวตามเดิม)
  const showDiscount = Number(discount) > 0;

  const itemsTable = (pageItems: TaxInvoicePrintItem[], startIndex: number) => (
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
            <td className="py-[length:var(--print-row-padding)]">{item.description}</td>
            <td className="py-[length:var(--print-row-padding)]">{item.size ?? ""}</td>
            <td className="text-right py-[length:var(--print-row-padding)]">
              {Number(item.quantity)} {item.unit}
            </td>
            <td className="text-right py-[length:var(--print-row-padding)]">{money(item.unitPrice)}</td>
            {showDiscount && (
              <td className="text-right py-[length:var(--print-row-padding)]">{money(item.discountAmount)}</td>
            )}
            <td className="text-right py-[length:var(--print-row-padding)]">{money(item.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const summaryRows = (
    vals: { subtotal: unknown; discount: unknown; afterDiscount: unknown; valueAmount: unknown; vatAmount: unknown; net: unknown },
    netLabel: string
  ) => (
    <div className="text-[length:var(--print-body-size)] space-y-1">
      <div className="flex justify-between">
        <span>รวมเป็นเงิน / Subtotal</span>
        <span>{money(vals.subtotal)}</span>
      </div>
      {showDiscount && (
        <>
          <div className="flex justify-between">
            <span>หักส่วนลด / Discount</span>
            <span>{money(vals.discount)}</span>
          </div>
          <div className="flex justify-between">
            <span>ยอดรวมหลังหักส่วนลด / After Discount</span>
            <span>{money(vals.afterDiscount)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between">
        <span>มูลค่าสินค้าก่อน VAT / Value Amount</span>
        <span>{money(vals.valueAmount)}</span>
      </div>
      <div className="flex justify-between">
        <span>ภาษีมูลค่าเพิ่ม / VAT {Number(vatPct)}%</span>
        <span>{money(vals.vatAmount)}</span>
      </div>
      <div className="flex justify-between font-semibold border-t pt-1">
        <span>{netLabel}</span>
        <span>{money(vals.net)}</span>
      </div>
    </div>
  );

  const docSummaryBlock = (
    <div className="border rounded p-2 grid grid-cols-2 gap-4 mb-[length:var(--print-block-gap)]">
      <PrintAmountWordsRemark amountInWords={amountInWords} />
      {summaryRows(
        { subtotal, discount, afterDiscount: netAmount, valueAmount, vatAmount, net: netAmount },
        "ยอดสุทธิ / Net Amount"
      )}
    </div>
  );

  if (!pagination) {
    return (
      <>
        {itemsTable(items, 0)}
        <div className="flex-1" />
        <div className="print-keep-together">
          {docSummaryBlock}
          <PrintSignatureBlock footerNote={footerNote} />
        </div>
      </>
    );
  }

  const pageCount = pagination.pages.length;
  let cursor = 0;
  return (
    <>
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
                  {summaryRows(
                    {
                      subtotal: page.summary.subtotal,
                      discount: page.summary.discount,
                      afterDiscount: page.summary.net,
                      valueAmount: page.summary.valueAmount,
                      vatAmount: page.summary.vatAmount,
                      net: page.summary.net,
                    },
                    "ยอดสุทธิหน้านี้"
                  )}
                </div>
              )}
              {isLast && docSummaryBlock}
              {isLast && <PrintSignatureBlock footerNote={footerNote} />}
            </div>
          </section>
        );
      })}
    </>
  );
}
