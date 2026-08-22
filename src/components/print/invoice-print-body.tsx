import { PrintAmountWordsRemark } from "./print-amount-words-remark";

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
export function InvoicePrintBody({
  items,
  grossAmount,
  discountAmount,
  grandTotal,
  amountInWords,
  applyDiscount,
  disclaimer,
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
}) {
  const showDiscount = applyDiscount;

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
            {showDiscount && <th className="text-right py-[length:var(--print-row-padding)]">ส่วนลด</th>}
            <th className="text-right py-[length:var(--print-row-padding)]">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} className="border-b border-dashed">
              <td className="py-[length:var(--print-row-padding)]">{i + 1}</td>
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

      <div className="flex-1" />

      <div className="print-keep-together">
        <div className="border rounded p-2 grid grid-cols-2 gap-4 mb-[length:var(--print-block-gap)]">
          <PrintAmountWordsRemark amountInWords={amountInWords} />
          <div className="text-[length:var(--print-body-size)] space-y-1">
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
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>สุทธิ / Net Amount</span>
              <span>{money(grandTotal)}</span>
            </div>
          </div>
        </div>
        {disclaimer}
      </div>
    </>
  );
}
