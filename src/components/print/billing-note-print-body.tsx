import { PrintSignatureBlock } from "./print-signature-block";
import { PrintPageLabel, type PrintBodyPagination } from "./print-pagination-parts";
import type { MoneyPageSummary } from "@/lib/print-pagination";

function money(n: unknown) {
  return Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type BillingNotePrintInvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDateLabel: string;
  dueDateLabel: string;
  grandTotal: unknown;
  // Smoke Test (2026-08-25) — ส่วนลดระดับใบวางบิล (แจงต่อใบตามที่ Owner เลือก) — Optional
  // ทั้งชุด: หน้า Print ส่งมาเฉพาะใบวางบิลที่ applyDiscount จริง ส่วน Designer/ใบ Legacy
  // ไม่ส่ง → Layout เดิมทุกประการ — typeName: Owner แจ้งลูกค้าเสมอว่า % นี้เป็นของกลุ่มไหน
  // จึงพิมพ์ชื่อกลุ่มกำกับต่อใบด้วย (R4)
  discountAmount?: number;
  discountPct?: number;
  alreadyDiscounted?: boolean;
  typeName?: string | null;
};

// R6 Phase E — แยกออกมาจากเดิมที่เคย Inline อยู่ในหน้า Print ตรงๆ (billing-notes/[id]/
// print/page.tsx) เพื่อ Single Rendering Source เดียวกับ Designer — Pure Extraction
// ไม่เปลี่ยน Layout ใดๆ — วันที่ (invoiceDateLabel/dueDateLabel) รับมาเป็น String
// สำเร็จรูปแทนที่จะรับ Date ตรงๆ เพราะ Designer ต้องส่ง Label ตัวอย่างเข้ามาได้โดยไม่ต้อง
// สร้าง Date จริงปลอมๆ (Sample Data ล้วนๆ ไม่ใช่ Transaction จริง)
//
// R8 — Document Pagination: แถวของเอกสารนี้คือ "ใบ Invoice" (ไม่ใช่รายการสินค้า) —
// Summary ประจำหน้า = แถว tfoot "รวมหน้านี้" ของหน้านั้น / หน้าสุดท้ายมีแถว "รวมทั้ง
// เอกสาร" (ค่า Persist เดิม) + คำอ่าน + Signature เพิ่ม — เอกสารหน้าเดียว Output เดิมเป๊ะ
export function BillingNotePrintBody({
  invoices,
  totalAmount,
  amountInWords,
  footerNote,
  showDiscount,
  grossTotal,
  discountTotal,
  groupLabel,
  pagination,
}: {
  invoices: BillingNotePrintInvoiceRow[];
  totalAmount: unknown;
  amountInWords: string;
  footerNote?: string;
  /** true = ใบวางบิลนี้หักส่วนลดกลุ่ม → เพิ่มคอลัมน์ ส่วนลด/สุทธิ (Optional — ไม่ส่ง = Layout เดิม) */
  showDiscount?: boolean;
  grossTotal?: unknown;
  discountTotal?: unknown;
  /** Smoke Test R9 (2026-08-25) — Owner: ไม่ว่าจะติ๊กใช้ส่วนลดหรือไม่ ใบวางบิลต้องบอกกลุ่ม
   * ส่วนลดเสมอ (R7 แยกใบตามกลุ่มอยู่แล้ว) — null = ไม่แสดง (เช่นยังไม่มี Invoice เลย) */
  groupLabel?: string | null;
  pagination?: PrintBodyPagination<BillingNotePrintInvoiceRow, MoneyPageSummary>;
}) {
  const intro = (
    <>
      {groupLabel && (
        <p className="text-[length:var(--print-body-size)] mb-[length:var(--print-block-gap)] font-medium">
          กลุ่มส่วนลด: {groupLabel}
        </p>
      )}
      <p className="text-[length:var(--print-body-size)] mb-[length:var(--print-block-gap)]">บริษัทฯ ขอแจ้งรายละเอียดใบกำกับที่ครบกำหนดชำระแล้ว ดังต่อไปนี้</p>
    </>
  );

  const totalsRow = (label: string, vals: { gross: unknown; discount: unknown; net: unknown }) => (
    <tr className="border-t font-medium">
      <td colSpan={3} className="py-[length:var(--print-row-padding)] text-right">
        {label}
      </td>
      {showDiscount ? (
        <>
          <td className="text-right py-[length:var(--print-row-padding)]">{money(vals.gross)}</td>
          <td className="text-right py-[length:var(--print-row-padding)]">-{money(vals.discount)}</td>
          <td className="text-right py-[length:var(--print-row-padding)]">{money(vals.net)}</td>
        </>
      ) : (
        <td className="text-right py-[length:var(--print-row-padding)]">{money(vals.net)}</td>
      )}
    </tr>
  );

  const invoicesTable = (rows: BillingNotePrintInvoiceRow[], tfootRows: React.ReactNode) => (
    <table className="print-table w-full mb-[length:var(--print-block-gap)] text-[length:var(--print-body-size)]">
      <thead>
        <tr className="border-b">
          <th className="text-left py-[length:var(--print-row-padding)]">เลขที่ใบกำกับ</th>
          <th className="text-left py-[length:var(--print-row-padding)]">วันที่</th>
          <th className="text-left py-[length:var(--print-row-padding)]">วันครบกำหนด</th>
          <th className="text-right py-[length:var(--print-row-padding)]">จำนวนเงิน</th>
          {showDiscount && <th className="text-right py-[length:var(--print-row-padding)]">ส่วนลด</th>}
          {showDiscount && <th className="text-right py-[length:var(--print-row-padding)]">สุทธิ</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((inv) => (
          <tr key={inv.id} className="border-b border-dashed">
            <td className="py-[length:var(--print-row-padding)]">{inv.invoiceNumber}</td>
            <td className="py-[length:var(--print-row-padding)]">{inv.invoiceDateLabel}</td>
            <td className="py-[length:var(--print-row-padding)]">{inv.dueDateLabel}</td>
            <td className="text-right py-[length:var(--print-row-padding)]">{money(inv.grandTotal)}</td>
            {showDiscount && (
              <td className="text-right py-[length:var(--print-row-padding)] whitespace-nowrap">
                {inv.alreadyDiscounted
                  ? "หักแล้วตอนออกใบ"
                  : (inv.discountAmount ?? 0) > 0
                    ? `${money(inv.discountAmount)} (${inv.discountPct}%${inv.typeName ? ` — ${inv.typeName}` : ""})`
                    : "—"}
              </td>
            )}
            {showDiscount && (
              <td className="text-right py-[length:var(--print-row-padding)]">
                {money(Number(inv.grandTotal ?? 0) - (inv.discountAmount ?? 0))}
              </td>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>{tfootRows}</tfoot>
    </table>
  );

  const docTotals = { gross: grossTotal, discount: discountTotal, net: totalAmount };

  const closingBlock = (
    <div className="print-keep-together">
      <div className="text-[length:var(--print-body-size)] mb-2">({amountInWords})</div>
      <PrintSignatureBlock fields={["ผู้รับวางบิล / Received By", "ผู้ส่งวางบิล / Delivery By"]} footerNote={footerNote} />
    </div>
  );

  if (!pagination) {
    return (
      <>
        {intro}
        {invoicesTable(invoices, totalsRow("รวม / Total", docTotals))}
        <div className="flex-1" />
        {closingBlock}
      </>
    );
  }

  const pageCount = pagination.pages.length;
  return (
    <>
      {pagination.pages.map((page, idx) => {
        const isLast = idx === pageCount - 1;
        // หน้าเดียว = แถวรวมเดิมแถวเดียว (Output เดิมเป๊ะ) / หลายหน้า = "รวมหน้านี้" ทุก
        // หน้า + หน้าสุดท้ายเพิ่ม "รวมทั้งเอกสาร" (ค่า Persist ของใบวางบิลตรงๆ)
        const tfootRows =
          pageCount === 1 ? (
            totalsRow("รวม / Total", docTotals)
          ) : (
            <>
              {totalsRow(`รวมหน้านี้ (หน้า ${idx + 1}/${pageCount})`, page.summary)}
              {isLast && totalsRow("รวมทั้งเอกสาร / Grand Total", docTotals)}
            </>
          );
        return (
          <section key={idx} className="print-doc-page">
            {pagination.header}
            <PrintPageLabel pageNo={idx + 1} pageCount={pageCount} />
            {intro}
            {invoicesTable(page.items, tfootRows)}
            <div className="flex-1" />
            {/* Owner UAT (2026-09-02) — Signature ทุก Physical Sheet แผ่นละ 1 ชุด: หน้า
                สุดท้ายใช้ closingBlock เดิม (คำอ่าน + Signature) หน้าอื่น Render Signature
                ชุดเดียวกัน (Label ผู้รับ/ผู้ส่งวางบิลเดิม) โดยไม่มีคำอ่าน — ไม่มีแผ่นไหน
                ได้ Signature ซ้ำสองชุด */}
            {isLast ? (
              closingBlock
            ) : (
              <div className="print-keep-together">
                {/* Owner UAT (2026-09-02) — หน้าไม่จบไม่มีข้อความขอบคุณ (กฎเดียวกับ Invoice) */}
                <PrintSignatureBlock
                  fields={["ผู้รับวางบิล / Received By", "ผู้ส่งวางบิล / Delivery By"]}
                  footerNote={footerNote}
                  showFooterNote={false}
                />
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
