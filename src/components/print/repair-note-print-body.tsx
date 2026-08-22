import { PrintSignatureBlock } from "./print-signature-block";

type RepairNotePrintItem = {
  id: string;
  description: string;
  size: string | null;
  quantity: unknown;
  unit: string;
};

// R6 Phase E — แยกออกมาจากเดิมที่เคย Inline อยู่ในหน้า Print ตรงๆ (repair-notes/[id]/
// print/page.tsx) เพื่อ Single Rendering Source เดียวกับ Designer — Pure Extraction
// ไม่เปลี่ยน Layout ใดๆ — ไม่มีราคา/VAT (ไม่ใช่เอกสารขาย) ตามเดิมทุกประการ
export function RepairNotePrintBody({
  items,
  remark,
  footerNote,
}: {
  items: RepairNotePrintItem[];
  remark?: string | null;
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
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} className="border-b border-dashed">
              <td className="py-[length:var(--print-row-padding)]">{i + 1}</td>
              <td className="py-[length:var(--print-row-padding)]">{item.description}</td>
              <td className="py-[length:var(--print-row-padding)]">{item.size ?? "-"}</td>
              <td className="text-right py-[length:var(--print-row-padding)]">
                {Number(item.quantity)} {item.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex-1" />

      <div className="print-keep-together">
        {remark && <div className="text-[length:var(--print-body-size)] text-gray-600 mb-2">หมายเหตุ: {remark}</div>}
        <PrintSignatureBlock footerNote={footerNote} />
      </div>
    </>
  );
}
