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
import { BillingNotePrintBody } from "@/components/print/billing-note-print-body";
import { getPrintTemplateSettings, type PrintBlockKey, type HeaderElementKey, logoHeightMm } from "@/lib/print-template-settings";

const CREDIT_DAYS: Record<string, number> = { CASH: 0, NET30: 30, NET60: 60, NET90: 90 };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Billing Note ไม่มี Item ของตัวเอง — รายการคือ Invoice ที่ถูกรวมบิล (ไม่ใช่ Product
// Item) ตามที่ยืนยันไว้ ห้ามเปลี่ยนเป็น Product Item Table ใน Phase D นี้
export default async function BillingNotePrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "billingNote.create")) redirect("/");

  const [note, company, template] = await Promise.all([
    db.billingNote.findUnique({ where: { id: params.id }, include: { invoices: true } }),
    getCompanySettings(),
    getPrintTemplateSettings("BILLING_NOTE"),
  ]);
  if (!note) notFound();

  const creditDays = CREDIT_DAYS[note.creditTermSnapshot] ?? 0;

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
    title: <PrintDocumentTitle titleTh="ใบวางบิล" titleEn="BILLING NOTE" />,
    customerInfo: (
      <PrintCustomerInfo
        left={[
          { label: "ลูกค้า", value: note.customerNameSnapshot },
          { label: "เลขประจำตัวผู้เสียภาษี", value: note.taxIdSnapshot ?? "-" },
        ]}
        right={[
          {
            label: "เลขที่",
            value: (
              <span className="inline-flex items-center gap-1">
                {note.billingNoteNumber}
                <CopyDocumentNumber value={note.billingNoteNumber} />
              </span>
            ),
          },
          { label: "วันที่", value: note.billingNoteDate.toLocaleDateString("th-TH") },
        ]}
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
            titleTh="ใบวางบิล"
            titleEn="BILLING NOTE"
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
                    {note.billingNoteNumber}
                    <CopyDocumentNumber value={note.billingNoteNumber} />
                  </span>
                ),
              },
              { label: "วันที่", value: note.billingNoteDate.toLocaleDateString("th-TH") },
            ]}
            fontSizePx={template.headerLayout.docNumberDate.fontSizePx}
            lineHeight={template.headerLayout.docNumberDate.lineHeight}
          />
        ),
        customerName: (
          <HeaderCustomerNameElement
            name={note.customerNameSnapshot}
            fontSizePx={template.headerLayout.customerName.fontSizePx}
            lineHeight={template.headerLayout.customerName.lineHeight}
          />
        ),
        customerDetails: (
          <HeaderCustomerDetailsElement
            rows={[{ label: "เลขประจำตัวผู้เสียภาษี", value: note.taxIdSnapshot ?? "-" }]}
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

      <BillingNotePrintBody
        invoices={note.invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDateLabel: inv.invoiceDate.toLocaleDateString("th-TH"),
          dueDateLabel: addDays(inv.invoiceDate, creditDays).toLocaleDateString("th-TH"),
          grandTotal: inv.grandTotal,
        }))}
        totalAmount={note.totalAmount}
        amountInWords={toThaiBahtText(note.totalAmount)}
        footerNote={template.footerNote}
      />
    </PrintPage>
  );
}
