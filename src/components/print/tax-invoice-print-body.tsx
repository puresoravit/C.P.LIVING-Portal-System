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
// ไม่มีส่วนลดแสดง 0.00 เสมอ (ตาม Requirement) — vatPct มาจาก Snapshot ของเอกสาร
// (อ่านจาก VAT configuration ตอนสร้าง) ไม่ Hardcode 7 ทั้ง Label และการคำนวณ —
// grossAmount เป็น null ได้ (ใบเก่าก่อน Phase H ที่ไม่มีแนวคิดส่วนลด): Fallback =
// netAmount ซึ่งถูกต้องตามความจริงของใบเก่า (ส่วนลด 0) โดยไม่ Backfill ข้อมูล
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
}) {
  const subtotal = grossAmount ?? netAmount;
  const discount = discountAmount ?? 0;
  // คอลัมน์ส่วนลดต่อบรรทัดแสดงเฉพาะเอกสารที่มีส่วนลดจริง — ใบที่ไม่มีส่วนลด Layout
  // ตารางเหมือนเดิมทุกประการ (สรุปท้ายเอกสารยังแสดงแถวส่วนลด 0.00 ตาม Requirement)
  const showDiscountColumn = Number(discount) > 0;

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
            {showDiscountColumn && <th className="text-right py-[length:var(--print-row-padding)]">ส่วนลด</th>}
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
              {showDiscountColumn && (
                <td className="text-right py-[length:var(--print-row-padding)]">{money(item.discountAmount)}</td>
              )}
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
              <span>รวมเป็นเงิน / Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>หักส่วนลด / Discount</span>
              <span>{money(discount)}</span>
            </div>
            <div className="flex justify-between">
              <span>ยอดรวมหลังหักส่วนลด / After Discount</span>
              <span>{money(netAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>มูลค่าสินค้าก่อน VAT / Value Amount</span>
              <span>{money(valueAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>ภาษีมูลค่าเพิ่ม / VAT {Number(vatPct)}%</span>
              <span>{money(vatAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>ยอดสุทธิ / Net Amount</span>
              <span>{money(netAmount)}</span>
            </div>
          </div>
        </div>

        <PrintSignatureBlock footerNote={footerNote} />
      </div>
    </>
  );
}
