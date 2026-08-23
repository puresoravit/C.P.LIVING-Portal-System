import type { CompanySettings } from "@/lib/company-settings";
import {
  buildPrintCssVars,
  type DocumentTypeKey,
  type ResolvedTemplateSettings,
  type PrintBlockKey,
  type HeaderElementKey,
} from "@/lib/print-template-settings";
import type { PrintProfileKey } from "@/lib/print-settings";
import { PRINT_PROFILES } from "@/lib/print-settings";
import {
  getSampleDocInfo,
  getSampleHeaderZoneInfo,
  getSampleQuotationData,
  getSampleInvoiceData,
  getSampleTaxInvoiceData,
  getSampleBillingNoteData,
  getSampleRepairNoteData,
  sampleAmountToThaiWords,
  type SampleDensity,
} from "@/lib/print-sample-data";
import { PrintDocumentHeader } from "@/components/print/print-document-header";
import { PrintDocumentTitle } from "@/components/print/print-document-title";
import { PrintCustomerInfo } from "@/components/print/print-customer-info";
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
import { InvoicePrintBody } from "@/components/print/invoice-print-body";
import { TaxInvoicePrintBody } from "@/components/print/tax-invoice-print-body";
import { BillingNotePrintBody } from "@/components/print/billing-note-print-body";
import { RepairNotePrintBody } from "@/components/print/repair-note-print-body";

// R6 Phase E — Visual Designer Canvas: Single Rendering Source เดียวกับหน้า Print จริง
// เป๊ะ — เรียก Shared Print Component ชุดเดียวกัน (PrintOrderedBlocks +
// <Doc>PrintBody + PrintSignatureBlock) ที่หน้า Print จริงทั้ง 5 ประเภทเรียกอยู่ ต่างกัน
// แค่ Data ที่ป้อนเข้าไป (Sample Data แทน DB จริง) — ห้ามมี JSX ซ้ำ/แยกจากหน้า Print จริง
// เด็ดขาด กัน "แก้ใน Designer แล้ว Print จริงไม่เปลี่ยน" ตามที่ Owner ย้ำไว้
//
// พื้นที่ Preview เป็นความสูงยืดหยุ่นตามเนื้อหาจริง (ไม่ได้จำลอง Pagination ข้ามหน้า) —
// ข้อจำกัดเดิมเดียวกับหน้า Print จริงบนจอ (ดู print-page.tsx) ต้องตรวจ Pagination จริง
// ผ่าน Print Preview/Save PDF ของหน้าเอกสารจริงเท่านั้น ไม่ใช่ผ่าน Canvas นี้
export function PrintTemplateDesignerCanvas({
  docType,
  settings,
  company,
  profile,
  density,
}: {
  docType: DocumentTypeKey;
  settings: ResolvedTemplateSettings;
  company: CompanySettings;
  profile: PrintProfileKey;
  density: SampleDensity;
}) {
  const cssVars = buildPrintCssVars(settings);
  const pageWidthMm = PRINT_PROFILES[profile].pageSize === "A4" ? 210 : 228.6;

  return (
    <div className="overflow-auto bg-gray-100 rounded border p-4">
      <div
        className="print-page-fill bg-white shadow-sm mx-auto p-6 text-sm flex flex-col"
        style={{ width: `${pageWidthMm}mm`, minHeight: "150mm", ...cssVars } as React.CSSProperties}
      >
        {settings.headerLayout ? (
          <DesignerHeaderZone docType={docType} settings={settings} company={company} headerLayout={settings.headerLayout} />
        ) : (
          <DesignerClassicHeader docType={docType} settings={settings} company={company} />
        )}
        <DesignerDocBody docType={docType} density={density} footerNote={settings.footerNote} />
      </div>
    </div>
  );
}

// R6 Phase E — Path เดิม (โหมด Classic, headerLayout === null) — ไม่แตะ Logic นี้เลย
function DesignerClassicHeader({
  docType,
  settings,
  company,
}: {
  docType: DocumentTypeKey;
  settings: ResolvedTemplateSettings;
  company: CompanySettings;
}) {
  const info = getSampleDocInfo(docType);
  const blocks: Record<PrintBlockKey, React.ReactNode> = {
    header: (
      <PrintDocumentHeader
        company={company}
        logo={settings.logo}
        logoSize={settings.logoSize}
        showAddress={settings.showAddress}
        showPhone={settings.showPhone}
        showTaxId={settings.showTaxId}
      />
    ),
    title: <PrintDocumentTitle titleTh={info.titleTh} titleEn={info.titleEn} />,
    customerInfo: (
      <PrintCustomerInfo left={info.customerLeft} right={info.customerRight} shippingAddress={info.shippingAddress} />
    ),
  };
  return <PrintOrderedBlocks order={settings.blockOrder} blocks={blocks} />;
}

// R6 Phase E.1 — Path ใหม่ (โหมด Custom, headerLayout ไม่เป็น null) — Element เดียวกับ
// ที่หน้า Print จริงทั้ง 5 เรียก (header-elements.tsx) แค่ป้อน Sample Data แทน DB จริง
function DesignerHeaderZone({
  docType,
  settings,
  company,
  headerLayout,
}: {
  docType: DocumentTypeKey;
  settings: ResolvedTemplateSettings;
  company: CompanySettings;
  headerLayout: NonNullable<ResolvedTemplateSettings["headerLayout"]>;
}) {
  const info = getSampleHeaderZoneInfo(docType);
  const elements: Record<HeaderElementKey, React.ReactNode> = {
    logo: <HeaderLogoElement logo={settings.logo} heightPx={headerLayout.logo.heightPx} />,
    companyInfo: (
      <HeaderCompanyInfoElement
        company={company}
        showAddress={settings.showAddress}
        showPhone={settings.showPhone}
        showTaxId={settings.showTaxId}
        fontSizePx={headerLayout.companyInfo.fontSizePx}
        lineHeight={headerLayout.companyInfo.lineHeight}
      />
    ),
    title: (
      <HeaderTitleElement
        titleTh={info.titleTh}
        titleEn={info.titleEn}
        fontSizePx={headerLayout.title.fontSizePx}
        lineHeight={headerLayout.title.lineHeight}
      />
    ),
    docNumberDate: (
      <HeaderDocNumberDateElement
        rows={info.docNumberDateRows}
        fontSizePx={headerLayout.docNumberDate.fontSizePx}
        lineHeight={headerLayout.docNumberDate.lineHeight}
      />
    ),
    customerName: (
      <HeaderCustomerNameElement
        name={info.customerName}
        fontSizePx={headerLayout.customerName.fontSizePx}
        lineHeight={headerLayout.customerName.lineHeight}
      />
    ),
    customerDetails: (
      <HeaderCustomerDetailsElement
        rows={info.customerDetailsRows}
        shippingAddress={info.shippingAddress}
        fontSizePx={headerLayout.customerDetails.fontSizePx}
        lineHeight={headerLayout.customerDetails.lineHeight}
      />
    ),
  };
  return <HeaderZone layout={headerLayout} elements={elements} />;
}

function DesignerDocBody({
  docType,
  density,
  footerNote,
}: {
  docType: DocumentTypeKey;
  density: SampleDensity;
  footerNote?: string;
}) {
  switch (docType) {
    case "QUOTATION": {
      const d = getSampleQuotationData(density, true, false);
      return (
        <>
          <QuotationPrintBody
            items={d.items}
            note={d.note}
            amountInWords={sampleAmountToThaiWords(d.grandTotal)}
            grossAmount={d.grossAmount}
            discountAmount={d.discountAmount}
            applyDiscount={d.applyDiscount}
            vatMode={d.vatMode}
            vatRateSnapshot={d.vatRateSnapshot}
            netBeforeVat={d.netBeforeVat}
            vatAmount={d.vatAmount}
            grandTotal={d.grandTotal}
          />
          <PrintSignatureBlock footerNote={footerNote} />
        </>
      );
    }
    case "INVOICE": {
      const d = getSampleInvoiceData(density, true);
      return (
        <>
          <InvoicePrintBody
            items={d.items}
            grossAmount={d.grossAmount}
            discountAmount={d.discountAmount}
            grandTotal={d.grandTotal}
            amountInWords={sampleAmountToThaiWords(d.grandTotal)}
            applyDiscount={d.applyDiscount}
          />
          <PrintSignatureBlock footerNote={footerNote} />
        </>
      );
    }
    case "TAX_INVOICE": {
      const d = getSampleTaxInvoiceData(density);
      return (
        <TaxInvoicePrintBody
          items={d.items}
          valueAmount={d.valueAmount}
          vatPct={d.vatPct}
          vatAmount={d.vatAmount}
          netAmount={d.netAmount}
          amountInWords={sampleAmountToThaiWords(d.netAmount)}
          footerNote={footerNote}
        />
      );
    }
    case "BILLING_NOTE": {
      const d = getSampleBillingNoteData(density);
      return (
        <BillingNotePrintBody
          invoices={d.invoices}
          totalAmount={d.totalAmount}
          amountInWords={sampleAmountToThaiWords(d.totalAmount)}
          footerNote={footerNote}
        />
      );
    }
    case "REPAIR_NOTE": {
      const d = getSampleRepairNoteData(density);
      return <RepairNotePrintBody items={d.items} remark={d.remark} footerNote={footerNote} />;
    }
  }
}
