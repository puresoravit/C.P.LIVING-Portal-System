import { PrintSignatureBlock } from "./print-signature-block";

function money(n: unknown) {
  return Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type BillingNotePrintInvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDateLabel: string;
  dueDateLabel: string;
  grandTotal: unknown;
};

// R6 Phase E — แยกออกมาจากเดิมที่เคย Inline อยู่ในหน้า Print ตรงๆ (billing-notes/[id]/
// print/page.tsx) เพื่อ Single Rendering Source เดียวกับ Designer — Pure Extraction
// ไม่เปลี่ยน Layout ใดๆ — วันที่ (invoiceDateLabel/dueDateLabel) รับมาเป็น String
// สำเร็จรูปแทนที่จะรับ Date ตรงๆ เพราะ Designer ต้องส่ง Label ตัวอย่างเข้ามาได้โดยไม่ต้อง
// สร้าง Date จริงปลอมๆ (Sample Data ล้วนๆ ไม่ใช่ Transaction จริง)
export function BillingNotePrintBody({
  invoices,
  totalAmount,
  amountInWords,
  footerNote,
}: {
  invoices: BillingNotePrintInvoiceRow[];
  totalAmount: unknown;
  amountInWords: string;
  footerNote?: string;
}) {
  return (
    <>
      <p className="text-[length:var(--print-body-size)] mb-[length:var(--print-block-gap)]">บริษัทฯ ขอแจ้งรายละเอียดใบกำกับที่ครบกำหนดชำระแล้ว ดังต่อไปนี้</p>

      <table className="print-table w-full mb-[length:var(--print-block-gap)] text-[length:var(--print-body-size)]">
        <thead>
          <tr className="border-b">
            <th className="text-left py-[length:var(--print-row-padding)]">เลขที่ใบกำกับ</th>
            <th className="text-left py-[length:var(--print-row-padding)]">วันที่</th>
            <th className="text-left py-[length:var(--print-row-padding)]">วันครบกำหนด</th>
            <th className="text-right py-[length:var(--print-row-padding)]">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b border-dashed">
              <td className="py-[length:var(--print-row-padding)]">{inv.invoiceNumber}</td>
              <td className="py-[length:var(--print-row-padding)]">{inv.invoiceDateLabel}</td>
              <td className="py-[length:var(--print-row-padding)]">{inv.dueDateLabel}</td>
              <td className="text-right py-[length:var(--print-row-padding)]">{money(inv.grandTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium">
            <td colSpan={3} className="py-[length:var(--print-row-padding)] text-right">
              รวม / Total
            </td>
            <td className="text-right py-[length:var(--print-row-padding)]">{money(totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="flex-1" />

      <div className="print-keep-together">
        <div className="text-[length:var(--print-body-size)] mb-2">({amountInWords})</div>
        <PrintSignatureBlock fields={["ผู้รับวางบิล / Received By", "ผู้ส่งวางบิล / Delivery By"]} footerNote={footerNote} />
      </div>
    </>
  );
}
