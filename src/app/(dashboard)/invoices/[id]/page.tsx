import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { cancelInvoice } from "../actions";
import { createTaxInvoiceFromInvoice } from "../../tax-invoices/actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CancelButton } from "@/components/cancel-button";
import { CopyDocumentNumber } from "@/components/copy-document-number";
import { displayProductTypeCode } from "@/lib/order-preview";
import { BackLink } from "@/components/back-link";
import { NumberReleasedBadge } from "@/components/number-released-badge";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-blue-100 text-blue-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function InvoiceDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: {
      items: { orderBy: { lineNo: { sort: "asc", nulls: "last" } } },
      // Owner Approve (2026-09-02) — Physical Sheet: โชว์แผ่นทั้งหมด (รวมแผ่นที่ถูกยุบ
      // เป็นประวัติ) — ทุกเลขต้องเปิดดู/อ้างอิงได้จริงจากหน้านี้
      sheets: { orderBy: [{ voidedAt: "asc" }, { sheetNo: "asc" }] },
      order: true,
      billingNote: { select: { id: true, billingNoteNumber: true } },
      // Stabilization — ใช้กฎเดียวกับหน้า /tax-invoices/from-invoice: Invoice ที่มีใบกำกับภาษี
      // Active อยู่แล้ว ห้ามออกซ้ำ (Server Action บังคับอีกชั้นใน createTaxInvoiceFromInvoice)
      taxInvoices: { where: { status: { not: "CANCELLED" } }, select: { id: true, taxInvoiceNumber: true }, take: 1 },
    },
  });
  if (!invoice) notFound();

  const status = STATUS_LABEL[invoice.status];
  const cancelAction = cancelInvoice.bind(null, invoice.id);
  const existingTaxInvoice = invoice.taxInvoices[0] ?? null;
  const activeSiblingInvoice = invoice.numberReleased
    ? await db.invoice.findFirst({ where: { invoiceNumber: invoice.invoiceNumber, numberReleased: false }, select: { id: true } })
    : null;

  return (
    <div className="max-w-3xl">
      <BackLink href="/invoices">← กลับไปรายการ Invoice</BackLink>

      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold font-mono flex items-center gap-1.5">
          {invoice.invoiceNumber}
          <CopyDocumentNumber value={invoice.invoiceNumber} />
        </h1>
        <span className="flex items-center gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
          {invoice.numberReleased && <NumberReleasedBadge />}
        </span>
      </div>
      {invoice.numberReleased && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
          เลขที่นี้ถูกยกเลิกก่อนใช้งานจริงและถูกปล่อยคืนให้เอกสารถัดไปใช้ต่อแล้ว
          {activeSiblingInvoice && (
            <>
              {" "}
              — <a href={`/invoices/${activeSiblingInvoice.id}`} className="underline">ดูเอกสารที่ใช้เลขนี้อยู่ตอนนี้</a>
            </>
          )}
        </p>
      )}
      <p className="text-sm text-gray-500 mb-4">
        จาก Order:{" "}
        <a href={`/orders/${invoice.order.id}`} className="text-blue-600 hover:underline font-mono">
          {invoice.order.orderNumber}
        </a>{" "}
        · {invoice.invoiceDate.toLocaleDateString("th-TH")} · กลุ่มส่วนลด {displayProductTypeCode(invoice.productTypeCode)}
        {invoice.printedAt && ` · พิมพ์แล้วเมื่อ ${invoice.printedAt.toLocaleDateString("th-TH")}`}
      </p>

      {/* Owner UAT (2026-08-29) — เตือนถาวรว่าใบนี้ถูกแก้ไขหลังพิมพ์แล้ว (ต่างจาก Modal
          Acknowledge ตอนกำลังแก้ ซึ่งเป็นแค่ครั้งเดียว) — อัปเดตเวลาล่าสุดทุกครั้งที่แก้ซ้ำ */}
      {invoice.editedAfterPrintAt && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
          ⚠ แก้ไขหลังจากส่งสินค้าแล้ว — ล่าสุดเมื่อ {invoice.editedAfterPrintAt.toLocaleDateString("th-TH")}{" "}
          {invoice.editedAfterPrintAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      {/* Owner Approve (2026-09-02) — Physical Sheet: เลขอ้างอิงรายแผ่น + สถานะพิมพ์ต่อแผ่น
          (PRINTED Checkpoint ระดับแผ่น — ใบหลักเป็น PRINTED เมื่อครบทุกแผ่น) — แผ่นที่ถูก
          ยุบจากการแก้ไขยังแสดงเป็นประวัติเสมอ ทุกเลขค้น/อ้างอิงได้จริง */}
      {invoice.sheets.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-600">
            แผ่นเอกสาร (Physical Sheets) — {invoice.sheets.filter((s) => s.voidedAt == null).length} แผ่น
          </div>
          <table className="w-full text-sm">
            <tbody>
              {invoice.sheets.map((sheet) => {
                const sheetItemCount = invoice.items.filter((it) => it.sheetId === sheet.id).length;
                const voided = sheet.voidedAt != null;
                return (
                  <tr key={sheet.id} className={`border-t ${voided ? "text-gray-400" : ""}`}>
                    <td className="px-4 py-2 font-mono">
                      {voided ? (
                        sheet.sheetNumber
                      ) : (
                        <a
                          href={`/invoices/${invoice.id}/print?sheet=${sheet.sheetNo}`}
                          className="text-blue-600 hover:underline"
                        >
                          {sheet.sheetNumber}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2">{voided ? "แผ่นถูกยุบจากการแก้ไข" : `แผ่นที่ ${sheet.sheetNo} · ${sheetItemCount} รายการ`}</td>
                    <td className="px-4 py-2">
                      {voided ? (
                        sheet.numberReleased ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">คืนเลขแล้ว</span>
                        ) : (
                          <span className="text-xs text-gray-400">เลขถูกยึดถาวร</span>
                        )
                      ) : sheet.printedAt ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          พิมพ์แล้ว {sheet.printedAt.toLocaleDateString("th-TH")}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">ยังไม่พิมพ์</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Billing Status Visibility — แกนแยกจาก Document Status ข้างบน มีความหมายเฉพาะ
          Invoice ที่ PRINTED เท่านั้น (ยังไม่ PRINTED ไม่มีทางมี billingNoteId อยู่แล้วตาม
          Business Rule เดิม — วางบิลได้ต้อง PRINTED ก่อน) */}
      {invoice.status === "PRINTED" && (
        <p className="text-sm mb-4">
          {invoice.billingNote ? (
            <>
              สถานะวางบิล:{" "}
              <a href={`/billing-notes/${invoice.billingNote.id}`} className="text-purple-700 hover:underline font-medium">
                วางบิลแล้ว — {invoice.billingNote.billingNoteNumber}
              </a>
            </>
          ) : (
            <span className="text-amber-700">สถานะวางบิล: ยังไม่วางบิล</span>
          )}
        </p>
      )}

      <div className="bg-white border rounded-lg p-4 mb-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">ลูกค้า:</span> {invoice.customerNameSnapshot}
          </div>
          <div>
            <span className="text-gray-500">เลขผู้เสียภาษี:</span> {invoice.taxIdSnapshot ?? "-"}
          </div>
          <div>
            <span className="text-gray-500">สาขา:</span> {invoice.branchNameSnapshot ?? "-"}
          </div>
          <div>
            <span className="text-gray-500">ที่อยู่:</span> {invoice.addressSnapshot ?? "-"}
          </div>
          {invoice.placeToDelivery && (
            <div className="col-span-1 sm:col-span-2">
              <span className="text-gray-500">สถานที่ส่งสินค้า:</span> {invoice.placeToDelivery}
            </div>
          )}
        </div>
        {/* Owner UAT (2026-08-23) — เอาข้อความอธิบาย Snapshot ที่เคยแสดงตรงนี้ออกตามคำสั่ง
            (เป็นโน้ตภายในสำหรับนักพัฒนา ไม่ควรโชว์ผู้ใช้จริง) — พฤติกรรม Snapshot จริงยังคง
            เดิมทุกประการ แค่ไม่แสดงคำอธิบายบนหน้าจอแล้ว (ตรวจแล้วมีจุดเดียวทั้งระบบ —
            หน้า Print ทั้ง 6 ไม่เคยมีข้อความนี้) */}
      </div>

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รหัสสินค้า</th>
              <th className="px-4 py-2 font-medium">รายการ</th>
              <th className="px-4 py-2 font-medium text-right">จำนวน</th>
              <th className="px-4 py-2 font-medium text-right">ราคา/หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
              <th className="px-4 py-2 font-medium text-right">ส่วนลด</th>
              <th className="px-4 py-2 font-medium text-right">สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2 font-mono">{item.skuSnapshot}</td>
                <td className="px-4 py-2">{item.productNameSnapshot}</td>
                <td className="px-4 py-2 text-right">
                  {Number(item.quantity)} {item.unitSnapshot}
                </td>
                <td className="px-4 py-2 text-right">{money(item.unitPriceSnapshot)}</td>
                <td className="px-4 py-2 text-right">{money(item.grossAmount)}</td>
                <td className="px-4 py-2 text-right">{money(item.discountAmount)}</td>
                <td className="px-4 py-2 text-right">{money(item.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 mb-4 text-sm ml-auto max-w-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">รวม (จำนวนเงิน)</span>
          <span>{money(invoice.grossAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">ส่วนลด ({Number(invoice.discountPct)}%)</span>
          <span>{money(invoice.discountAmount)}</span>
        </div>
        {Number(invoice.vatAmount) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">VAT ({Number(invoice.vatPct)}%)</span>
            <span>{money(invoice.vatAmount)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium border-t pt-1">
          <span>สุทธิ</span>
          <span>{money(invoice.grandTotal)} บาท</span>
        </div>
      </div>

      {invoice.status !== "CANCELLED" && (
        <div className="flex gap-2">
          <a
            href={`/invoices/${invoice.id}/print`}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
          >
            พิมพ์เอกสาร
          </a>
          {existingTaxInvoice ? (
            <a
              href={`/tax-invoices/${existingTaxInvoice.id}`}
              className="text-sm text-gray-700 hover:text-gray-900 border rounded px-4 py-2"
              title="Invoice นี้มีใบกำกับภาษีอยู่แล้ว — ยกเลิกใบเดิมก่อนถ้าต้องการออกใหม่"
            >
              ดูใบกำกับภาษี {existingTaxInvoice.taxInvoiceNumber}
            </a>
          ) : (
            <form action={createTaxInvoiceFromInvoice.bind(null, invoice.id)}>
              <button className="text-sm text-gray-700 hover:text-gray-900 border rounded px-4 py-2">
                สร้างใบกำกับภาษีจากใบนี้ (VAT 100%)
              </button>
            </form>
          )}
          <CancelButton
            action={cancelAction}
            confirmMessage="ยืนยันยกเลิก Invoice ใบนี้?"
            label="ยกเลิก Invoice ใบนี้"
            successMessage="ยกเลิก Invoice สำเร็จ"
          />
        </div>
      )}
      {invoice.status === "CANCELLED" && (
        <a
          href={`/invoices/${invoice.id}/print`}
          className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 inline-block"
        >
          พิมพ์เอกสาร (Invoice นี้ถูกยกเลิกแล้ว)
        </a>
      )}
    </div>
  );
}
