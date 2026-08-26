import { db } from "@/lib/db";
import { markTaxInvoicePrinted } from "../../actions";
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
import { HeaderLogoElement, HeaderTextLine, HeaderTitleLine } from "@/components/print/header-elements";
import { TaxInvoicePrintBody } from "@/components/print/tax-invoice-print-body";
import { getPrintTemplateSettings, type PrintBlockKey, type HeaderElementKey, logoHeightMm } from "@/lib/print-template-settings";
import { capacityForDocument, paginateRows, computeTaxInvoicePageSummary } from "@/lib/print-pagination";

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

  // R6 Phase E.3 — ดู quotations/[id]/print/page.tsx สำหรับคำอธิบายเต็มของ Pattern นี้
  const hl = template.headerLayout;
  const headerElements: Partial<Record<HeaderElementKey, React.ReactNode>> = hl
    ? {
        logo: <HeaderLogoElement logo={template.logo} heightMm={logoHeightMm(hl.logo)} />,
        companyName: <HeaderTitleLine text={company.name} style={hl.companyName} />,
        ...(company.address ? { companyAddress: <HeaderTextLine value={company.address} style={hl.companyAddress} /> } : {}),
        ...(company.phone ? { companyPhone: <HeaderTextLine label="โทร" value={company.phone} style={hl.companyPhone} /> } : {}),
        ...(company.taxId
          ? { companyTaxId: <HeaderTextLine label="เลขประจำตัวผู้เสียภาษี" value={company.taxId} style={hl.companyTaxId} /> }
          : {}),
        titleTh: <HeaderTitleLine text="ใบกำกับภาษี / ใบเสร็จรับเงิน" style={hl.titleTh} />,
        titleEn: <HeaderTitleLine text="TAX INVOICE / RECEIPT" style={hl.titleEn} />,
        docNumber: (
          <HeaderTextLine
            label="เลขที่"
            value={
              <span className="inline-flex items-center gap-1">
                {taxInvoice.taxInvoiceNumber}
                <CopyDocumentNumber value={taxInvoice.taxInvoiceNumber} />
              </span>
            }
            style={hl.docNumber}
          />
        ),
        docDate: <HeaderTextLine label="วันที่" value={taxInvoice.taxInvoiceDate.toLocaleDateString("th-TH")} style={hl.docDate} />,
        customerCode: <HeaderTextLine label="รหัสลูกค้า" value={taxInvoice.customer.code} style={hl.customerCode} />,
        customerName: <HeaderTextLine label="ลูกค้า" value={taxInvoice.customerNameSnapshot} style={hl.customerName} />,
        ...(taxInvoice.addressSnapshot
          ? { customerAddress: <HeaderTextLine label="ที่อยู่" value={taxInvoice.addressSnapshot} style={hl.customerAddress} /> }
          : {}),
        customerTaxId: (
          <HeaderTextLine label="เลขประจำตัวผู้เสียภาษี" value={taxInvoice.taxIdSnapshot ?? "-"} style={hl.customerTaxId} />
        ),
        ...(taxInvoice.placeToDelivery
          ? {
              shippingAddress: (
                <HeaderTextLine label="สถานที่ส่งสินค้า / Shipping Address" value={taxInvoice.placeToDelivery} style={hl.shippingAddress} />
              ),
            }
          : {}),
      }
    : {};

  return (
    <PrintPage
      templateSettings={template}
      docType="TAX_INVOICE"
      canEditTemplate={can((session?.user as any)?.role, "user.manage")}
      backHref={`/tax-invoices/${taxInvoice.id}`}
      // R13 — PRINTED Checkpoint + คำถามนับยอดขาย (ดู markTaxInvoicePrinted)
      markPrintedAction={taxInvoice.status === "CONFIRMED" ? markTaxInvoicePrinted.bind(null, taxInvoice.id) : undefined}
      isPrinted={taxInvoice.status === "PRINTED"}
      printedAtLabel={taxInvoice.printedAt ? taxInvoice.printedAt.toLocaleString("th-TH") : undefined}
      salesQuestion="นับใบกำกับภาษีใบนี้เป็นยอดขาย (Dashboard/รายงาน) — ติ๊กเฉพาะใบที่ขายตรงโดยไม่ได้ออกใบส่งของชั่วคราว (กันนับยอดซ้ำ)"
    >
      {/* R8 — Document Pagination: Header ซ้ำทุกหน้า + Summary ต่อหน้า (VAT ถอดด้วย
          extractVat เดิม) — เอกสารหน้าเดียว Output เดิมทุกประการ (ดู print-pagination.ts) */}
      <TaxInvoicePrintBody
        items={taxInvoice.items}
        grossAmount={taxInvoice.grossAmount}
        discountAmount={taxInvoice.discountAmount}
        valueAmount={taxInvoice.valueAmount}
        vatPct={taxInvoice.vatPct}
        vatAmount={taxInvoice.vatAmount}
        netAmount={taxInvoice.netAmount}
        amountInWords={toThaiBahtText(taxInvoice.netAmount)}
        footerNote={template.footerNote}
        pagination={{
          pages: paginateRows(taxInvoice.items, capacityForDocument(template, "TAX_INVOICE")).map((pageItems) => ({
            items: pageItems,
            summary: computeTaxInvoicePageSummary(pageItems, taxInvoice.vatPct),
          })),
          header: template.headerLayout ? (
            <HeaderZone layout={template.headerLayout} elements={headerElements} />
          ) : (
            <PrintOrderedBlocks order={template.blockOrder} blocks={blocks} />
          ),
        }}
      />
    </PrintPage>
  );
}
