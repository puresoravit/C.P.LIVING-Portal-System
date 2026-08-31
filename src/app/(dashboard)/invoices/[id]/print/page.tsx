import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { toThaiBahtText } from "@/lib/thai-baht-text";
import { markInvoicePrinted } from "../../actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PrintPage } from "@/components/print/print-page";
import { RememberPrintSession } from "@/components/draft-return";
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
import { capacityForDocument, paginateRows, computeItemsPageSummary } from "@/lib/print-pagination";

// Invoice ในระบบนี้คือ "ใบส่งของชั่วคราว" — ไม่มี VAT ตามที่ยืนยันไว้ตั้งแต่แรก
// (confirmOrder() ตั้ง vatPct/vatAmount = 0 เสมอ) Phase D ไม่แตะตัวเลข/สูตรใดๆ
// เปลี่ยนเฉพาะ Presentation — ห้ามเพิ่ม VAT ให้เอกสารประเภทนี้เด็ดขาด
export default async function InvoicePrintPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string; queue?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const [invoice, company, template] = await Promise.all([
    db.invoice.findUnique({ where: { id: params.id }, include: { items: true, customer: true } }),
    getCompanySettings(),
    getPrintTemplateSettings("INVOICE"),
  ]);
  if (!invoice) notFound();

  // Owner UAT Fix — Multi-Invoice Print Queue จากหน้า Order Detail:
  // - back: ปลายทางปุ่ม "← กลับ" (เช่น /orders/{id}) — Validate เป็น Internal Path เท่านั้น
  //   (Pattern เดียวกับ settings/print-template/page.tsx กัน Open Redirect) — ไม่ส่งมา =
  //   Fallback history.back() เดิมของ PrintButton (ทางเข้าจาก Invoice Center/หน้า Invoice
  //   ยังกลับที่เดิมเป๊ะ ไม่เปลี่ยนพฤติกรรม)
  // - queue: Invoice id ที่เหลือในคิว (คั่น ",") — กรองเฉพาะรูปแบบ cuid กันค่าปนเปื้อนจาก
  //   URL + Cap จำนวนกัน URL ยาวผิดปกติ — ใบถัดไปสืบทอด back/queue ที่เหลือต่อใน Link เอง
  const rawBack = searchParams.back;
  const backHref = rawBack && rawBack.startsWith("/") && !rawBack.startsWith("//") ? rawBack : undefined;
  const queueIds = (searchParams.queue ?? "")
    .split(",")
    .filter((id) => /^[a-z0-9]{20,32}$/i.test(id))
    .slice(0, 50);
  const nextId = queueIds[0];
  let nextHref: string | undefined;
  if (nextId) {
    const nextParams = new URLSearchParams();
    if (backHref) nextParams.set("back", backHref);
    if (queueIds.length > 1) nextParams.set("queue", queueIds.slice(1).join(","));
    nextHref = `/invoices/${nextId}/print?${nextParams.toString()}`;
  }

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
        companyName: <HeaderTitleLine text={company.name} style={hl.companyName} />,
        ...(company.address ? { companyAddress: <HeaderTextLine value={company.address} style={hl.companyAddress} /> } : {}),
        ...(company.phone ? { companyPhone: <HeaderTextLine label="โทร" value={company.phone} style={hl.companyPhone} /> } : {}),
        ...(company.taxId
          ? { companyTaxId: <HeaderTextLine label="เลขประจำตัวผู้เสียภาษี" value={company.taxId} style={hl.companyTaxId} /> }
          : {}),
        titleTh: <HeaderTitleLine text="ใบส่งของชั่วคราว" style={hl.titleTh} />,
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

  // Smoke Test R14 (2026-08-25) — จำหน้าพิมพ์นี้ (รวมคิวที่เหลือ) ให้กลับมาต่อได้จากเมนู
  // "สร้างเอกสาร → ใบส่งของชั่วคราว" — ยัง Active ตราบใดที่ใบปัจจุบันยังไม่ยืนยันพิมพ์
  // หรือยังมีใบเหลือในคิว / พิมพ์ครบแล้วล้างตัวเอง (ดู draft-return.tsx)
  const printSessionParams = new URLSearchParams();
  if (backHref) printSessionParams.set("back", backHref);
  if (queueIds.length > 0) printSessionParams.set("queue", queueIds.join(","));
  const printSessionQuery = printSessionParams.toString();
  const printSessionUrl = `/invoices/${invoice.id}/print${printSessionQuery ? `?${printSessionQuery}` : ""}`;
  const printSessionActive = (!isPrinted && invoice.status !== "CANCELLED") || queueIds.length > 0;
  const printSessionRemaining = queueIds.length + (!isPrinted && invoice.status !== "CANCELLED" ? 1 : 0);

  return (
    <PrintPage
      markPrintedAction={markPrintedAction}
      isPrinted={isPrinted}
      printedAtLabel={printedAtLabel}
      templateSettings={template}
      docType="INVOICE"
      canEditTemplate={can((session?.user as any)?.role, "user.manage")}
      backHref={backHref}
      nextHref={nextHref}
      nextRemaining={queueIds.length}
      // Owner UAT (2026-08-29) — ทดสอบพิมพ์กระดาษ 9×11 จริงแล้วขอฟอนต์ใหญ่ขึ้น 30%
      // + ตัวหนาทั้งหมด (อ่านยากเกินไปตอนนี้) — ขยายผ่าน CSS var เดิม (คูณค่าที่ Resolve
      // มาแล้วจาก Template Settings อีกทีที่ Container นี้) แทนการเปลี่ยน Default ของ
      // ระบบ Template กลาง เพราะยังไม่มีการยืนยันว่าเอกสารอื่น (ใบเสนอราคา/ใบกำกับภาษี/
      // ใบวางบิล/ใบซ่อม) ต้องการแบบเดียวกัน — ขอบเขตเฉพาะใบส่งของชั่วคราวเท่านั้น
      bodyClassName="font-bold"
      bodyStyle={{
        ["--print-body-size" as string]: "calc(var(--print-body-size) * 1.3)",
        ["--print-heading-size" as string]: "calc(var(--print-heading-size) * 1.3)",
      }}
    >
      <RememberPrintSession
        docKey="invoice"
        active={printSessionActive}
        url={printSessionUrl}
        remaining={printSessionRemaining}
      />
      {/* R8 — Document Pagination: Header เต็มถูกส่งเข้า Body ผ่าน pagination.header เพื่อ
          เรนเดอร์ซ้ำทุกหน้า (เอกสารหน้าเดียว Output เดิมทุกประการ) — การแบ่งหน้า/Summary
          ต่อหน้า ดู src/lib/print-pagination.ts */}
      <InvoicePrintBody
        items={invoice.items}
        grossAmount={invoice.grossAmount}
        discountAmount={invoice.discountAmount}
        grandTotal={invoice.grandTotal}
        amountInWords={toThaiBahtText(invoice.grandTotal)}
        applyDiscount={invoice.applyDiscount}
        disclaimer={
          // Owner UAT (2026-08-29) — ตัดมาสองบรรทัดได้ตามที่อนุญาต (ไม่บังคับบรรทัดเดียว
          // อีกต่อไป) — เอาป้าย float-right ออกเพราะเป็นสาเหตุที่ทำให้ข้อความชนกันจนดู
          // เหมือนตกขอบ ย้ายไปเป็นบรรทัดแยกด้านล่างแทน อ่านง่ายกว่าเดิมทั้งจอ Preview และ
          // กระดาษจริง — ขนาดตัวอักษรคูณสัดส่วนเดียวกับตัวเอกสาร (0.83 เท่าของ Body เดิม)
          // เพื่อให้โตขึ้นตามการขยาย 30% ข้างบนไปด้วยโดยอัตโนมัติ
          <div className="text-[length:calc(var(--print-body-size)*0.83)] text-gray-600 mb-2">
            <div>
              ได้รับสินค้าครบถ้วนตามรายการ ตรวจสอบแล้วอยู่ในสภาพสมบูรณ์ ไม่มีความเสียหายใดๆ
              หากเกิดความเสียหายหรือชำรุดภายหลังจากวันรับมอบ จะไม่ถือเป็นความรับผิดชอบของผู้ขาย
            </div>
            <div>ทะเบียนรถยนต์ ____________________</div>
          </div>
        }
        pagination={{
          pages: paginateRows(invoice.items, capacityForDocument(template, "INVOICE")).map((pageItems) => ({
            items: pageItems,
            summary: computeItemsPageSummary(pageItems),
          })),
          header: template.headerLayout ? (
            <HeaderZone layout={template.headerLayout} elements={headerElements} />
          ) : (
            <PrintOrderedBlocks order={template.blockOrder} blocks={blocks} />
          ),
          signature: <PrintSignatureBlock footerNote={template.footerNote} />,
        }}
      />
    </PrintPage>
  );
}
