"use client";

import { useState } from "react";
import { PrintAmountWordsRemark } from "./print-amount-words-remark";

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

// Discount Show/Hide Toggle — Presentation เท่านั้น ไม่แตะยอดที่ Snapshot ไว้จริงเลย
// (grandTotal/netBeforeVat/vatAmount แสดงเหมือนเดิมเสมอ ไม่ว่า Toggle จะเปิดหรือปิด
// — ซ่อนแค่ "แถวรายละเอียดส่วนลด" เท่านั้น) ค่าเริ่มต้นเปิด (แสดงส่วนลด) ตรงกับ
// พฤติกรรมเดิมของเอกสารอื่นทุกใบที่ไม่เคยมี Toggle นี้มาก่อน
export function QuotationPrintBody({
  items,
  note,
  amountInWords,
  grossAmount,
  discountAmount,
  vatMode,
  vatRateSnapshot,
  netBeforeVat,
  vatAmount,
  grandTotal,
}: {
  items: QuotationPrintItem[];
  note: string | null;
  amountInWords: string;
  grossAmount: unknown;
  discountAmount: unknown;
  vatMode: string;
  vatRateSnapshot: unknown;
  netBeforeVat: unknown;
  vatAmount: unknown;
  grandTotal: unknown;
}) {
  const [showDiscount, setShowDiscount] = useState(true);
  const hasVat = vatMode === "STANDARD";

  return (
    <>
      <div className="print:hidden flex items-center gap-1.5 mb-2 text-sm">
        <input
          id="show-discount"
          type="checkbox"
          checked={showDiscount}
          onChange={(e) => setShowDiscount(e.target.checked)}
        />
        <label htmlFor="show-discount">แสดงส่วนลดในเอกสาร</label>
      </div>

      <table className="print-table w-full mb-1.5 text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left py-1 w-8">No.</th>
            <th className="text-left py-1">รายการ</th>
            <th className="text-left py-1">ขนาด</th>
            <th className="text-right py-1">จำนวน</th>
            <th className="text-right py-1">ราคา/หน่วย</th>
            {showDiscount && <th className="text-right py-1">ส่วนลด</th>}
            <th className="text-right py-1">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} className="border-b border-dashed">
              <td className="py-1">{i + 1}</td>
              <td className="py-1">{item.productNameSnapshot}</td>
              <td className="py-1">{item.sizeSnapshot ?? ""}</td>
              <td className="text-right py-1">
                {Number(item.quantity)} {item.unitSnapshot}
              </td>
              <td className="text-right py-1">{money(item.unitPriceSnapshot)}</td>
              {showDiscount && <td className="text-right py-1">{money(item.discountAmount)}</td>}
              <td className="text-right py-1">{money(item.netAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex-1" />

      <div className="print-keep-together">
        <div className="border rounded p-2 grid grid-cols-2 gap-4 mb-1.5">
          <PrintAmountWordsRemark amountInWords={amountInWords} remark={note} />
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span>รวม / Total</span>
              <span>{money(grossAmount)}</span>
            </div>
            {showDiscount && (
              <div className="flex justify-between">
                <span>ส่วนลด / Discount</span>
                <span>{money(discountAmount)}</span>
              </div>
            )}
            {hasVat && (
              <>
                <div className="flex justify-between">
                  <span>มูลค่าก่อน VAT</span>
                  <span>{money(netBeforeVat)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ภาษีมูลค่าเพิ่ม / VAT {Number(vatRateSnapshot)}%</span>
                  <span>{money(vatAmount)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>{hasVat ? "Grand Total" : "สุทธิ / Net Amount"}</span>
              <span>{money(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
