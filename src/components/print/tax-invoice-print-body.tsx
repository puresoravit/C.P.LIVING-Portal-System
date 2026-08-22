import { PrintAmountWordsRemark } from "./print-amount-words-remark";
import { PrintSignatureBlock } from "./print-signature-block";

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
};

// R6 Phase E — แยกออกมาจากเดิมที่เคย Inline อยู่ในหน้า Print ตรงๆ (tax-invoices/[id]/
// print/page.tsx) เพื่อให้ Visual Designer เรียก Component เดียวกันกับหน้า Print จริง
// เป๊ะ (Single Rendering Source — ไม่มีการ Copy JSX ซ้ำ) — เป็น Pure Extraction ไม่มีการ
// เปลี่ยน Layout/สูตร VAT/ค่าใดๆ ทั้งสิ้น เทียบ JSX เดิมทุกบรรทัดแล้ว
export function TaxInvoicePrintBody({
  items,
  valueAmount,
  vatPct,
  vatAmount,
  netAmount,
  amountInWords,
  footerNote,
}: {
  items: TaxInvoicePrintItem[];
  valueAmount: unknown;
  vatPct: unknown;
  vatAmount: unknown;
  netAmount: unknown;
  amountInWords: string;
  footerNote?: string;
}) {
  return (
    <>
      <table className="print-table w-full mb-[length:var(--print-block-gap)] text-[length:var(--print-body-size)]">
        <thead>
          <tr className="border-b">
            <th className="text-left py-[length:var(--print-row-padding)] w-8">No.</th>
            <th className="text-left py-[length:var(--print-row-padding)]">รายการ</th>
            <th className="text-left py-[length:var(--print-row-padding)]">ขนาด</th>
            <th className="text-right py-[length:var(--print-row-padding)]">จำนวน</th>
            <th className="text-right py-[length:var(--print-row-padding)]">ราคา/หน่วย</th>
            <th className="text-right py-[length:var(--print-row-padding)]">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} className="border-b border-dashed">
              <td className="py-[length:var(--print-row-padding)]">{i + 1}</td>
              <td className="py-[length:var(--print-row-padding)]">{item.description}</td>
              <td className="py-[length:var(--print-row-padding)]">{item.size ?? ""}</td>
              <td className="text-right py-[length:var(--print-row-padding)]">
                {Number(item.quantity)} {item.unit}
              </td>
              <td className="text-right py-[length:var(--print-row-padding)]">{money(item.unitPrice)}</td>
              <td className="text-right py-[length:var(--print-row-padding)]">{money(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex-1" />

      <div className="print-keep-together">
        <div className="border rounded p-2 grid grid-cols-2 gap-4 mb-[length:var(--print-block-gap)]">
          <PrintAmountWordsRemark amountInWords={amountInWords} />
          <div className="text-[length:var(--print-body-size)] space-y-1">
            <div className="flex justify-between">
              <span>มูลค่าสินค้า / Value Amount</span>
              <span>{money(valueAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>ภาษีมูลค่าเพิ่ม / VAT {Number(vatPct)}%</span>
              <span>{money(vatAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>สุทธิ / Net Amount</span>
              <span>{money(netAmount)}</span>
            </div>
          </div>
        </div>

        <PrintSignatureBlock footerNote={footerNote} />
      </div>
    </>
  );
}
