import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { toThaiBahtText } from "@/lib/thai-baht-text";
import { markInvoicePrinted } from "../../actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PrintPage } from "@/components/print/print-page";
import { PrintDocumentHeader } from "@/components/print/print-document-header";
import { PrintDocumentTitle } from "@/components/print/print-document-title";
import { PrintCustomerInfo } from "@/components/print/print-customer-info";
import { CopyDocumentNumber } from "@/components/copy-document-number";
import { PrintAmountWordsRemark } from "@/components/print/print-amount-words-remark";
import { PrintSignatureBlock } from "@/components/print/print-signature-block";
import { getPrintTemplateSettings } from "@/lib/print-template-settings";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// Invoice ในระบบนี้คือ "ใบส่งของชั่วคราว" — ไม่มี VAT ตามที่ยืนยันไว้ตั้งแต่แรก
// (confirmOrder() ตั้ง vatPct/vatAmount = 0 เสมอ) Phase D ไม่แตะตัวเลข/สูตรใดๆ
// เปลี่ยนเฉพาะ Presentation — ห้ามเพิ่ม VAT ให้เอกสารประเภทนี้เด็ดขาด
export default async function InvoicePrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const [invoice, company, template] = await Promise.all([
    db.invoice.findUnique({ where: { id: params.id }, include: { items: true, customer: true } }),
    getCompanySettings(),
    getPrintTemplateSettings("INVOICE"),
  ]);
  if (!invoice) notFound();

  const markPrintedAction = markInvoicePrinted.bind(null, invoice.id);

  return (
    <PrintPage markPrintedAction={markPrintedAction} templateSettings={template}>
      <PrintDocumentHeader
        company={company}
        logo={template.logo}
        logoSize={template.logoSize}
        showAddress={template.showAddress}
        showPhone={template.showPhone}
        showTaxId={template.showTaxId}
      />
      <PrintDocumentTitle titleTh="ใบส่งของชั่วคราว" titleEn="INVOICE" />

      <PrintCustomerInfo
        left={[
          { label: "ลูกค้า", value: invoice.customerNameSnapshot },
          { label: "ที่อยู่", value: invoice.addressSnapshot ?? "-" },
        ]}
        right={[
          {
            label: "เลขที่",
            value: (
              <span className="inline-flex items-center gap-1">
                {invoice.invoiceNumber}
                <CopyDocumentNumber value={invoice.invoiceNumber} />
              </span>
            ),
          },
          { label: "วันที่", value: invoice.invoiceDate.toLocaleDateString("th-TH") },
          { label: "รหัสลูกค้า", value: invoice.customer.code },
        ]}
        shippingAddress={invoice.placeToDelivery}
      />

      <table className="print-table w-full mb-[length:var(--print-block-gap)] text-[length:var(--print-body-size)]">
        <thead>
          <tr className="border-b">
            <th className="text-left py-[length:var(--print-row-padding)] w-8">No.</th>
            <th className="text-left py-[length:var(--print-row-padding)]">รายการ</th>
            <th className="text-left py-[length:var(--print-row-padding)]">ขนาด</th>
            <th className="text-right py-[length:var(--print-row-padding)]">จำนวน</th>
            <th className="text-right py-[length:var(--print-row-padding)]">ราคา/หน่วย</th>
            <th className="text-right py-[length:var(--print-row-padding)]">ส่วนลด</th>
            <th className="text-right py-[length:var(--print-row-padding)]">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={item.id} className="border-b border-dashed">
              <td className="py-[length:var(--print-row-padding)]">{i + 1}</td>
              <td className="py-[length:var(--print-row-padding)]">{item.productNameSnapshot}</td>
              <td className="py-[length:var(--print-row-padding)]">{item.sizeSnapshot ?? ""}</td>
              <td className="text-right py-[length:var(--print-row-padding)]">
                {Number(item.quantity)} {item.unitSnapshot}
              </td>
              <td className="text-right py-[length:var(--print-row-padding)]">{money(item.unitPriceSnapshot)}</td>
              <td className="text-right py-[length:var(--print-row-padding)]">{money(item.discountAmount)}</td>
              <td className="text-right py-[length:var(--print-row-padding)]">{money(item.netAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex-1" />

      <div className="print-keep-together">
        <div className="border rounded p-2 grid grid-cols-2 gap-4 mb-[length:var(--print-block-gap)]">
          <PrintAmountWordsRemark amountInWords={toThaiBahtText(invoice.grandTotal)} />
          <div className="text-[length:var(--print-body-size)] space-y-1">
            <div className="flex justify-between">
              <span>รวม / Total</span>
              <span>{money(invoice.grossAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>ส่วนลด / Discount</span>
              <span>{money(invoice.discountAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>สุทธิ / Net Amount</span>
              <span>{money(invoice.grandTotal)}</span>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-gray-600 mb-2">
          ได้รับสินค้าครบถ้วนตามรายการ ตรวจสอบแล้วอยู่ในสภาพสมบูรณ์ ไม่มีความเสียหายใดๆ
          หากเกิดความเสียหายหรือชำรุดภายหลังจากวันรับมอบ จะไม่ถือเป็นความรับผิดชอบของผู้ขาย
          <span className="float-right">ทะเบียนรถยนต์ ____________________</span>
        </div>

        <PrintSignatureBlock footerNote={template.footerNote} />
      </div>
    </PrintPage>
  );
}
