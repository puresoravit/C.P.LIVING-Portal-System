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
  // Smoke Test (2026-08-25) — ส่วนลดระดับใบวางบิล (แจงต่อใบตามที่ Owner เลือก) — Optional
  // ทั้งชุด: หน้า Print ส่งมาเฉพาะใบวางบิลที่ applyDiscount จริง ส่วน Designer/ใบ Legacy
  // ไม่ส่ง → Layout เดิมทุกประการ
  discountAmount?: number;
  discountPct?: number;
  alreadyDiscounted?: boolean;
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
  showDiscount,
  grossTotal,
  discountTotal,
}: {
  invoices: BillingNotePrintInvoiceRow[];
  totalAmount: unknown;
  amountInWords: string;
  footerNote?: string;
  /** true = ใบวางบิลนี้หักส่วนลดกลุ่ม → เพิ่มคอลัมน์ ส่วนลด/สุทธิ (Optional — ไม่ส่ง = Layout เดิม) */
  showDiscount?: boolean;
  grossTotal?: unknown;
  discountTotal?: unknown;
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
            {showDiscount && <th className="text-right py-[length:var(--print-row-padding)]">ส่วนลด</th>}
            {showDiscount && <th className="text-right py-[length:var(--print-row-padding)]">สุทธิ</th>}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
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
                      ? `${money(inv.discountAmount)} (${inv.discountPct}%)`
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
        <tfoot>
          <tr className="border-t font-medium">
            <td colSpan={3} className="py-[length:var(--print-row-padding)] text-right">
              รวม / Total
            </td>
            {showDiscount ? (
              <>
                <td className="text-right py-[length:var(--print-row-padding)]">{money(grossTotal)}</td>
                <td className="text-right py-[length:var(--print-row-padding)]">-{money(discountTotal)}</td>
                <td className="text-right py-[length:var(--print-row-padding)]">{money(totalAmount)}</td>
              </>
            ) : (
              <td className="text-right py-[length:var(--print-row-padding)]">{money(totalAmount)}</td>
            )}
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
