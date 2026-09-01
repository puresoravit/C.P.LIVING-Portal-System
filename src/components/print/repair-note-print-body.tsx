import { PrintSignatureBlock } from "./print-signature-block";
import { PrintPageLabel, type PrintBodyPagination } from "./print-pagination-parts";

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
//
// R8 — Document Pagination: เอกสารนี้ไม่มีจำนวนเงิน — แบ่งหน้าอย่างเดียว (Summary ต่อหน้า
// จึงไม่มีตามธรรมชาติของแบบฟอร์ม) หมายเหตุ + Signature อยู่หน้าสุดท้ายเท่านั้น
export function RepairNotePrintBody({
  items,
  remark,
  footerNote,
  pagination,
}: {
  items: RepairNotePrintItem[];
  remark?: string | null;
  footerNote?: string;
  pagination?: PrintBodyPagination<RepairNotePrintItem, null>;
}) {
  const itemsTable = (pageItems: RepairNotePrintItem[], startIndex: number) => (
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
        {pageItems.map((item, i) => (
          <tr key={item.id} className="border-b border-dashed">
            <td className="py-[length:var(--print-row-padding)]">{startIndex + i + 1}</td>
            <td className="py-[length:var(--print-row-padding)]">{item.description}</td>
            <td className="py-[length:var(--print-row-padding)]">{item.size ?? "-"}</td>
            <td className="text-right py-[length:var(--print-row-padding)]">
              {Number(item.quantity)} {item.unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const closingBlock = (
    <div className="print-keep-together">
      {remark && <div className="text-[length:var(--print-body-size)] text-gray-600 mb-2">หมายเหตุ: {remark}</div>}
      <PrintSignatureBlock footerNote={footerNote} />
    </div>
  );

  if (!pagination) {
    return (
      <>
        {itemsTable(items, 0)}
        <div className="flex-1" />
        {closingBlock}
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
            {/* Owner UAT (2026-09-02) — Signature ทุก Physical Sheet แผ่นละ 1 ชุด: หน้า
                สุดท้ายใช้ closingBlock เดิม (หมายเหตุ + Signature) หน้าอื่นได้ Signature
                ชุดเดียวกันโดยไม่มีหมายเหตุ */}
            {isLast ? (
              closingBlock
            ) : (
              <div className="print-keep-together">
                <PrintSignatureBlock footerNote={footerNote} />
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
