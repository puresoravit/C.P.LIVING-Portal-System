import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { toThaiBahtText } from "@/lib/thai-baht-text";
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

// Tax Invoice มี VAT จริง (extractVat ใน tax-invoices/actions.ts) — Phase D ไม่แตะ
// สูตร VAT/Value/Net ใดๆ เปลี่ยนเฉพาะ Presentation
export default async function TaxInvoicePrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "taxInvoice.create")) redirect("/");

  const [taxInvoice, company, template] = await Promise.all([
    db.taxInvoice.findUnique({ where: { id: params.id }, include: { items: true, customer: true } }),
    getCompanySettings(),
    getPrintTemplateSettings("TAX_INVOICE"),
  ]);
  if (!taxInvoice) notFound();

  return (
    <PrintPage templateSettings={template}>
      <PrintDocumentHeader
        company={company}
        logo={template.logo}
        logoSize={template.logoSize}
        showAddress={template.showAddress}
        showPhone={template.showPhone}
        showTaxId={template.showTaxId}
      />
      <PrintDocumentTitle titleTh="ใบกำกับภาษี / ใบเสร็จรับเงิน" titleEn="TAX INVOICE / RECEIPT" />

      <PrintCustomerInfo
        left={[
          { label: "ลูกค้า", value: taxInvoice.customerNameSnapshot },
          { label: "เลขประจำตัวผู้เสียภาษี", value: taxInvoice.taxIdSnapshot ?? "-" },
          { label: "ที่อยู่", value: taxInvoice.addressSnapshot ?? "-" },
        ]}
        right={[
          {
            label: "เลขที่",
            value: (
              <span className="inline-flex items-center gap-1">
                {taxInvoice.taxInvoiceNumber}
                <CopyDocumentNumber value={taxInvoice.taxInvoiceNumber} />
              </span>
            ),
          },
          { label: "วันที่", value: taxInvoice.taxInvoiceDate.toLocaleDateString("th-TH") },
          { label: "รหัสลูกค้า", value: taxInvoice.customer.code },
        ]}
        shippingAddress={taxInvoice.placeToDelivery}
      />

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
          {taxInvoice.items.map((item, i) => (
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
          <PrintAmountWordsRemark amountInWords={toThaiBahtText(taxInvoice.netAmount)} />
          <div className="text-[length:var(--print-body-size)] space-y-1">
            <div className="flex justify-between">
              <span>มูลค่าสินค้า / Value Amount</span>
              <span>{money(taxInvoice.valueAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>ภาษีมูลค่าเพิ่ม / VAT {Number(taxInvoice.vatPct)}%</span>
              <span>{money(taxInvoice.vatAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>สุทธิ / Net Amount</span>
              <span>{money(taxInvoice.netAmount)}</span>
            </div>
          </div>
        </div>

        <PrintSignatureBlock footerNote={template.footerNote} />
      </div>
    </PrintPage>
  );
}
