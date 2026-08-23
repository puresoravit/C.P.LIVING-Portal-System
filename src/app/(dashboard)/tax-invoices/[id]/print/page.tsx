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
import { PrintOrderedBlocks } from "@/components/print/print-ordered-blocks";
import { HeaderZone } from "@/components/print/header-zone";
import {
  HeaderLogoElement,
  HeaderCompanyInfoElement,
  HeaderTitleElement,
  HeaderDocNumberDateElement,
  HeaderCustomerNameElement,
  HeaderCustomerDetailsElement,
} from "@/components/print/header-elements";
import { TaxInvoicePrintBody } from "@/components/print/tax-invoice-print-body";
import { getPrintTemplateSettings, type PrintBlockKey, type HeaderElementKey, logoHeightMm } from "@/lib/print-template-settings";

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

  // R6 Phase E — Header/Title/CustomerInfo Render ตามลำดับที่ Owner จัดไว้ผ่าน Visual
  // Designer (template.blockOrder) — Item Table/Summary/Signature ตรึงตำแหน่งเสมอ (ดู
  // print-template-settings.ts สำหรับเหตุผลเต็ม)
  const blocks: Record<PrintBlockKey, React.ReactNode> = {
    header: (
      <PrintDocumentHeader
        company={company}
        logo={template.logo}
        logoSize={template.logoSize}
        showAddress={template.showAddress}
        showPhone={template.showPhone}
        showTaxId={template.showTaxId}
      />
    ),
    title: <PrintDocumentTitle titleTh="ใบกำกับภาษี / ใบเสร็จรับเงิน" titleEn="TAX INVOICE / RECEIPT" />,
    customerInfo: (
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
    ),
  };

  // R6 Phase E.1 — ดู quotations/[id]/print/page.tsx สำหรับคำอธิบายเต็มของ Pattern นี้
  const headerElements: Record<HeaderElementKey, React.ReactNode> = template.headerLayout
    ? {
        logo: <HeaderLogoElement logo={template.logo} heightMm={logoHeightMm(template.headerLayout.logo)} />,
        companyInfo: (
          <HeaderCompanyInfoElement
            company={company}
            showAddress={template.showAddress}
            showPhone={template.showPhone}
            showTaxId={template.showTaxId}
            fontSizePx={template.headerLayout.companyInfo.fontSizePx}
            lineHeight={template.headerLayout.companyInfo.lineHeight}
          />
        ),
        title: (
          <HeaderTitleElement
            titleTh="ใบกำกับภาษี / ใบเสร็จรับเงิน"
            titleEn="TAX INVOICE / RECEIPT"
            fontSizePx={template.headerLayout.title.fontSizePx}
            lineHeight={template.headerLayout.title.lineHeight}
          />
        ),
        docNumberDate: (
          <HeaderDocNumberDateElement
            rows={[
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
            fontSizePx={template.headerLayout.docNumberDate.fontSizePx}
            lineHeight={template.headerLayout.docNumberDate.lineHeight}
          />
        ),
        customerName: (
          <HeaderCustomerNameElement
            name={taxInvoice.customerNameSnapshot}
            fontSizePx={template.headerLayout.customerName.fontSizePx}
            lineHeight={template.headerLayout.customerName.lineHeight}
          />
        ),
        customerDetails: (
          <HeaderCustomerDetailsElement
            rows={[
              { label: "เลขประจำตัวผู้เสียภาษี", value: taxInvoice.taxIdSnapshot ?? "-" },
              { label: "ที่อยู่", value: taxInvoice.addressSnapshot ?? "-" },
            ]}
            shippingAddress={taxInvoice.placeToDelivery}
            fontSizePx={template.headerLayout.customerDetails.fontSizePx}
            lineHeight={template.headerLayout.customerDetails.lineHeight}
          />
        ),
      }
    : ({} as Record<HeaderElementKey, React.ReactNode>);

  return (
    <PrintPage templateSettings={template}>
      {template.headerLayout ? (
        <HeaderZone layout={template.headerLayout} elements={headerElements} />
      ) : (
        <PrintOrderedBlocks order={template.blockOrder} blocks={blocks} />
      )}

      <TaxInvoicePrintBody
        items={taxInvoice.items}
        valueAmount={taxInvoice.valueAmount}
        vatPct={taxInvoice.vatPct}
        vatAmount={taxInvoice.vatAmount}
        netAmount={taxInvoice.netAmount}
        amountInWords={toThaiBahtText(taxInvoice.netAmount)}
        footerNote={template.footerNote}
      />
    </PrintPage>
  );
}
