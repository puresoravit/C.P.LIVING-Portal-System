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
import { PrintSignatureBlock } from "@/components/print/print-signature-block";
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
import { QuotationPrintBody } from "@/components/print/quotation-print-body";
import { getPrintTemplateSettings, type PrintBlockKey, type HeaderElementKey, logoHeightMm } from "@/lib/print-template-settings";
import { displayQuotationNumber } from "@/lib/running-number";

// ใบเสนอราคา — Adapt Layout จากใบส่งของชั่วคราว (Phase D) ใช้ Shared Print Components
// เดิมทั้งหมด ไม่มี VAT โดย Default (vatMode=NONE) แต่รองรับ vatMode=STANDARD ได้ —
// พิมพ์ได้เฉพาะ CONFIRMED ขึ้นไปเท่านั้น (DRAFT ยังไม่มี Snapshot ให้พิมพ์)
export default async function QuotationPrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "quotation.print")) redirect("/");

  const [quotation, company, template] = await Promise.all([
    db.quotation.findUnique({ where: { id: params.id }, include: { items: true, customer: true } }),
    getCompanySettings(),
    getPrintTemplateSettings("QUOTATION"),
  ]);
  if (!quotation) notFound();
  if (quotation.status === "DRAFT") redirect(`/quotations/${quotation.id}`);

  // Owner UAT Fix Batch — ข้อ 3: ห้ามแสดง "Rev. N" ใน Print/Preview — ใช้เลขที่เอกสาร
  // ต่อท้ายด้วย -N แทน (ดู displayQuotationNumber สำหรับเหตุผลเต็มว่าทำไมปลอดภัย)
  const displayNumber = displayQuotationNumber(quotation.quotationNumber, quotation.revisionNo);

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
    title: <PrintDocumentTitle titleTh="ใบเสนอราคา" titleEn="QUOTATION" />,
    customerInfo: (
      <PrintCustomerInfo
        left={[
          { label: "ลูกค้า", value: quotation.customerNameSnapshot },
          { label: "ที่อยู่", value: quotation.addressSnapshot ?? "-" },
        ]}
        right={[
          {
            label: "เลขที่",
            value: (
              <span className="inline-flex items-center gap-1">
                {displayNumber}
                <CopyDocumentNumber value={displayNumber} />
              </span>
            ),
          },
          { label: "วันที่", value: quotation.quotationDate.toLocaleDateString("th-TH") },
          { label: "รหัสลูกค้า", value: quotation.customer.code },
          ...(quotation.customerTaxIdSnapshot ? [{ label: "เลขผู้เสียภาษี", value: quotation.customerTaxIdSnapshot }] : []),
        ]}
        shippingAddress={quotation.placeToDelivery}
      />
    ),
  };

  // R6 Phase E.1 — headerLayout ไม่เป็น null = Owner เปิดโหมด Header Layout แบบละเอียด
  // ไว้แล้วสำหรับเอกสารประเภทนี้ — Render ผ่าน HeaderZone (6 Element อิสระ) แทน 3 Block
  // เดิม — เป็น null (Default) ใช้ Path Classic เดิมด้านบนเป๊ะ ไม่เปลี่ยนอะไรเลย
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
            titleTh="ใบเสนอราคา"
            titleEn="QUOTATION"
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
                    {displayNumber}
                    <CopyDocumentNumber value={displayNumber} />
                  </span>
                ),
              },
              { label: "วันที่", value: quotation.quotationDate.toLocaleDateString("th-TH") },
              { label: "รหัสลูกค้า", value: quotation.customer.code },
            ]}
            fontSizePx={template.headerLayout.docNumberDate.fontSizePx}
            lineHeight={template.headerLayout.docNumberDate.lineHeight}
          />
        ),
        customerName: (
          <HeaderCustomerNameElement
            name={quotation.customerNameSnapshot}
            fontSizePx={template.headerLayout.customerName.fontSizePx}
            lineHeight={template.headerLayout.customerName.lineHeight}
          />
        ),
        customerDetails: (
          <HeaderCustomerDetailsElement
            rows={[
              { label: "ที่อยู่", value: quotation.addressSnapshot ?? "-" },
              ...(quotation.customerTaxIdSnapshot ? [{ label: "เลขผู้เสียภาษี", value: quotation.customerTaxIdSnapshot }] : []),
            ]}
            shippingAddress={quotation.placeToDelivery}
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

      <QuotationPrintBody
        items={quotation.items}
        note={quotation.note}
        amountInWords={toThaiBahtText(quotation.grandTotal ?? 0)}
        grossAmount={quotation.grossAmount}
        discountAmount={quotation.discountAmount}
        applyDiscount={quotation.applyDiscount}
        vatMode={quotation.vatMode}
        vatRateSnapshot={quotation.vatRateSnapshot}
        netBeforeVat={quotation.netBeforeVat}
        vatAmount={quotation.vatAmount}
        grandTotal={quotation.grandTotal}
      />

      <PrintSignatureBlock footerNote={template.footerNote} />
    </PrintPage>
  );
}
