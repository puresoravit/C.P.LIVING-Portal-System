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
import { InvoicePrintBody } from "@/components/print/invoice-print-body";
import { getPrintTemplateSettings } from "@/lib/print-template-settings";

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

      <InvoicePrintBody
        items={invoice.items}
        grossAmount={invoice.grossAmount}
        discountAmount={invoice.discountAmount}
        grandTotal={invoice.grandTotal}
        amountInWords={toThaiBahtText(invoice.grandTotal)}
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
