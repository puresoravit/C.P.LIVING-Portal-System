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
import { PrintSignatureBlock } from "@/components/print/print-signature-block";
import { PrintOrderedBlocks } from "@/components/print/print-ordered-blocks";
import { HeaderZone } from "@/components/print/header-zone";
import { HeaderLogoElement, HeaderTextLine, HeaderTitleLine } from "@/components/print/header-elements";
import { InvoicePrintBody } from "@/components/print/invoice-print-body";
import { getPrintTemplateSettings, type PrintBlockKey, type HeaderElementKey, logoHeightMm } from "@/lib/print-template-settings";

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

  const markPrintedAction = invoice.status === "CANCELLED" ? undefined : markInvoicePrinted.bind(null, invoice.id);
  const isPrinted = invoice.status === "PRINTED";
  const printedAtLabel = invoice.printedAt
    ? invoice.printedAt.toLocaleDateString("th-TH") + " " + invoice.printedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
    : undefined;

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
    title: <PrintDocumentTitle titleTh="ใบส่งของชั่วคราว" titleEn="INVOICE" />,
    customerInfo: (
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
    ),
  };

  // R6 Phase E.3 — ดู quotations/[id]/print/page.tsx สำหรับคำอธิบายเต็มของ Pattern นี้
  const hl = template.headerLayout;
  const headerElements: Partial<Record<HeaderElementKey, React.ReactNode>> = hl
    ? {
        logo: <HeaderLogoElement logo={template.logo} heightMm={logoHeightMm(hl.logo)} />,
        companyName: <HeaderTitleLine text={company.name} bold style={hl.companyName} />,
        ...(company.address ? { companyAddress: <HeaderTextLine value={company.address} style={hl.companyAddress} /> } : {}),
        ...(company.phone ? { companyPhone: <HeaderTextLine label="โทร" value={company.phone} style={hl.companyPhone} /> } : {}),
        ...(company.taxId
          ? { companyTaxId: <HeaderTextLine label="เลขประจำตัวผู้เสียภาษี" value={company.taxId} style={hl.companyTaxId} /> }
          : {}),
        titleTh: <HeaderTitleLine text="ใบส่งของชั่วคราว" bold style={hl.titleTh} />,
        titleEn: <HeaderTitleLine text="INVOICE" style={hl.titleEn} />,
        docNumber: (
          <HeaderTextLine
            label="เลขที่"
            value={
              <span className="inline-flex items-center gap-1">
                {invoice.invoiceNumber}
                <CopyDocumentNumber value={invoice.invoiceNumber} />
              </span>
            }
            style={hl.docNumber}
          />
        ),
        docDate: <HeaderTextLine label="วันที่" value={invoice.invoiceDate.toLocaleDateString("th-TH")} style={hl.docDate} />,
        customerCode: <HeaderTextLine label="รหัสลูกค้า" value={invoice.customer.code} style={hl.customerCode} />,
        customerName: <HeaderTextLine label="ลูกค้า" value={invoice.customerNameSnapshot} style={hl.customerName} />,
        ...(invoice.addressSnapshot
          ? { customerAddress: <HeaderTextLine label="ที่อยู่" value={invoice.addressSnapshot} style={hl.customerAddress} /> }
          : {}),
        ...(invoice.placeToDelivery
          ? {
              shippingAddress: (
                <HeaderTextLine label="สถานที่ส่งสินค้า / Shipping Address" value={invoice.placeToDelivery} style={hl.shippingAddress} />
              ),
            }
          : {}),
      }
    : {};

  return (
    <PrintPage
      markPrintedAction={markPrintedAction}
      isPrinted={isPrinted}
      printedAtLabel={printedAtLabel}
      templateSettings={template}
    >
      {template.headerLayout ? (
        <HeaderZone layout={template.headerLayout} elements={headerElements} />
      ) : (
        <PrintOrderedBlocks order={template.blockOrder} blocks={blocks} />
      )}

      <InvoicePrintBody
        items={invoice.items}
        grossAmount={invoice.grossAmount}
        discountAmount={invoice.discountAmount}
        grandTotal={invoice.grandTotal}
        amountInWords={toThaiBahtText(invoice.grandTotal)}
        applyDiscount={invoice.applyDiscount}
        disclaimer={
          <div className="text-[10px] text-gray-600 mb-2">
            ได้รับสินค้าครบถ้วนตามรายการ ตรวจสอบแล้วอยู่ในสภาพสมบูรณ์ ไม่มีความเสียหายใดๆ
            หากเกิดความเสียหายหรือชำรุดภายหลังจากวันรับมอบ จะไม่ถือเป็นความรับผิดชอบของผู้ขาย
            <span className="float-right">ทะเบียนรถยนต์ ____________________</span>
          </div>
        }
      />

      <PrintSignatureBlock footerNote={template.footerNote} />
    </PrintPage>
  );
}
