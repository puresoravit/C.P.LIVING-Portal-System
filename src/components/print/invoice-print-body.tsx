import { PrintAmountWordsRemark } from "./print-amount-words-remark";
import { PrintPageLabel, type PrintBodyPagination } from "./print-pagination-parts";
import type { MoneyPageSummary } from "@/lib/print-pagination";

function money(n: unknown) {
  return Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type InvoicePrintItem = {
  id: string;
  productNameSnapshot: string | null;
  sizeSnapshot: string | null;
  quantity: unknown;
  unitSnapshot: string | null;
  unitPriceSnapshot: unknown;
  discountAmount: unknown;
  netAmount: unknown;
};

// R6 Phase D — เดิม (Phase C) เป็น Presentation Toggle ที่ผู้ใช้กดเปิด/ปิดเองตอน Print
// เปลี่ยนตาม Requirement ใหม่: ต้องสะท้อน Calculation/Snapshot ของเอกสารจริงเท่านั้น
// (applyDiscount) ไม่ใช่ Toggle อิสระอีกต่อไป — ถ้าเอกสารนี้ "ไม่ใช้ส่วนลด"
// (applyDiscount=false) discountAmount จะเป็น 0 อยู่แล้วจริงๆ (ไม่ใช่ข้อมูลปลอม) แต่ซ่อน
// คอลัมน์/แถวไปเลยเพื่อไม่ให้ดูเหมือนมีส่วนลด 0% ที่ตั้งใจให้ — Invoice ไม่มี VAT เลย
// (ยืนยันตั้งแต่ R1) จึงไม่มี Toggle VAT ใดๆ ต่างจาก Quotation
//
// R8 — Document Pagination: รับ `pagination` (Optional) จากหน้า Print จริง — แบ่งรายการ
// เป็นหน้าๆ ทุกหน้าเป็นฟอร์มสมบูรณ์ (Header ซ้ำ + ตาราง + Summary เฉพาะรายการหน้านั้น)
// หน้าสุดท้ายมี Grand Total ทั้งเอกสาร (ค่า Persist เดิม ไม่ Recompute) + Signature —
// ไม่ส่ง pagination = โครงเดิมทุกประการ (Designer/Sample Data ใช้เส้นทางนี้)
export function InvoicePrintBody({
  items,
  grossAmount,
  discountAmount,
  grandTotal,
  amountInWords,
  applyDiscount,
  disclaimer,
  pagination,
}: {
  items: InvoicePrintItem[];
  grossAmount: unknown;
  discountAmount: unknown;
  grandTotal: unknown;
  amountInWords: string;
  /** Snapshot ของ Invoice.applyDiscount — คุมว่าแสดงคอลัมน์/แถวส่วนลดหรือไม่ */
  applyDiscount: boolean;
  /** ข้อความรับรองสภาพสินค้าใต้สรุปยอด — อยู่ Block เดียวกับสรุปยอดเพื่อกัน Print แยกหน้า (break-inside-avoid ผ่าน print-keep-together) */
  disclaimer?: React.ReactNode;
  pagination?: PrintBodyPagination<InvoicePrintItem, MoneyPageSummary>;
}) {
  const showDiscount = applyDiscount;

  const itemsTable = (pageItems: InvoicePrintItem[], startIndex: number) => (
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

  // แถวตัวเลข Summary — ใช้ร่วมกันทั้ง Block ประจำหน้า (ค่าของหน้านั้น) และ Grand Total
  // (ค่า Persist ของเอกสาร) ให้หน้าตา/ลำดับแถวตรงกันเป๊ะตามแบบฟอร์มเดิม
  const summaryRows = (vals: { gross: unknown; discount: unknown; net: unknown }, netLabel: string) => (
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
      <div className="flex justify-between font-semibold border-t pt-1">
        <span>{netLabel}</span>
        <span>{money(vals.net)}</span>
      </div>
    </div>
  );

  const docSummaryBlock = (
    <>
      <div className="border rounded p-2 grid grid-cols-2 gap-4 mb-[length:var(--print-block-gap)]">
        <PrintAmountWordsRemark amountInWords={amountInWords} />
        {summaryRows({ gross: grossAmount, discount: discountAmount, net: grandTotal }, "สุทธิ / Net Amount")}
      </div>
      {disclaimer}
    </>
  );

  if (!pagination) {
    return (
      <>
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
                  {summaryRows(page.summary, "สุทธิหน้านี้")}
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
