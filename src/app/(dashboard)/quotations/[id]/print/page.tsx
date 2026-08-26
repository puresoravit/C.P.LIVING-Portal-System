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
import { HeaderLogoElement, HeaderTextLine, HeaderTitleLine } from "@/components/print/header-elements";
import { QuotationPrintBody } from "@/components/print/quotation-print-body";
import { getPrintTemplateSettings, type PrintBlockKey, type HeaderElementKey, logoHeightMm } from "@/lib/print-template-settings";
import { displayQuotationNumber } from "@/lib/running-number";
import { capacityForDocument, paginateRows, computeQuotationPageSummary } from "@/lib/print-pagination";

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

  // Phase H — Guest Quotation: customer เป็น null ได้ (ข้อมูลลูกค้าอยู่ใน Snapshot ทั้งหมด
  // ตั้งแต่ตอนสร้าง) — รหัสลูกค้าแสดง "-" และแสดงผู้ติดต่อ/โทรศัพท์ที่กรอกไว้ (ถ้ามี)
  const customerCode = quotation.customer?.code ?? "-";
  const guestContactLine = [
    quotation.contactSnapshot ? `ผู้ติดต่อ: ${quotation.contactSnapshot}` : null,
    quotation.phoneSnapshot ? `โทร ${quotation.phoneSnapshot}` : null,
  ]
    .filter(Boolean)
    .join(" ");

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
          ...(guestContactLine ? [{ label: "ผู้ติดต่อ", value: guestContactLine }] : []),
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
          { label: "รหัสลูกค้า", value: customerCode },
          ...(quotation.customerTaxIdSnapshot ? [{ label: "เลขผู้เสียภาษี", value: quotation.customerTaxIdSnapshot }] : []),
        ]}
        shippingAddress={quotation.placeToDelivery}
      />
    ),
  };

  // R6 Phase E.3 — headerLayout ไม่เป็น null = Owner เปิดโหมด Semantic Element Free
  // Layout ไว้แล้วสำหรับเอกสารประเภทนี้ — Render ผ่าน HeaderZone (15 Element ระดับ
  // บรรทัดเดียว อิสระทั้ง X/Y) แทน 3 Block เดิม — เป็น null (Default) ใช้ Path Classic
  // เดิมด้านบนเป๊ะ ไม่เปลี่ยนอะไรเลย — Element ที่ไม่มีข้อมูลจริง (เช่นไม่มีที่อยู่) ไม่ใส่
  // Key นั้นเข้าไปเลย (HeaderZone จะไม่ Render ให้ ดู header-zone.tsx)
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
        titleTh: <HeaderTitleLine text="ใบเสนอราคา" style={hl.titleTh} />,
        titleEn: <HeaderTitleLine text="QUOTATION" style={hl.titleEn} />,
        docNumber: (
          <HeaderTextLine
            label="เลขที่"
            value={
              <span className="inline-flex items-center gap-1">
                {displayNumber}
                <CopyDocumentNumber value={displayNumber} />
              </span>
            }
            style={hl.docNumber}
          />
        ),
        docDate: <HeaderTextLine label="วันที่" value={quotation.quotationDate.toLocaleDateString("th-TH")} style={hl.docDate} />,
        customerCode: <HeaderTextLine label="รหัสลูกค้า" value={customerCode} style={hl.customerCode} />,
        customerName: <HeaderTextLine label="ลูกค้า" value={quotation.customerNameSnapshot} style={hl.customerName} />,
        // Phase H — Guest ที่กรอกผู้ติดต่อ/โทรศัพท์ไว้: ต่อท้ายบรรทัดที่อยู่ (Element
        // customerAddress เดิม — headerLayout ของ Owner ไม่มี Key ใหม่ให้จัดตำแหน่ง จึงไม่
        // เพิ่ม Element ใหม่เข้าไปใน Layout ที่ Owner จัดไว้แล้ว) — ลูกค้า Master ไม่กระทบ
        // เลย (guestContactLine ว่างเสมอ)
        ...(quotation.addressSnapshot || guestContactLine
          ? {
              customerAddress: (
                <HeaderTextLine
                  label="ที่อยู่"
                  value={[quotation.addressSnapshot, guestContactLine].filter(Boolean).join(" — ")}
                  style={hl.customerAddress}
                />
              ),
            }
          : {}),
        ...(quotation.customerTaxIdSnapshot
          ? { customerTaxId: <HeaderTextLine label="เลขผู้เสียภาษี" value={quotation.customerTaxIdSnapshot} style={hl.customerTaxId} /> }
          : {}),
        ...(quotation.placeToDelivery
          ? {
              shippingAddress: (
                <HeaderTextLine label="สถานที่ส่งสินค้า / Shipping Address" value={quotation.placeToDelivery} style={hl.shippingAddress} />
              ),
            }
          : {}),
      }
    : {};

  return (
    <PrintPage templateSettings={template} docType="QUOTATION" canEditTemplate={can((session?.user as any)?.role, "user.manage")} backHref={`/quotations/${quotation.id}`}>
      {/* R8 — Document Pagination: Header เต็มเรนเดอร์ซ้ำทุกหน้าผ่าน pagination.header —
          VAT ต่อหน้า (โหมด STANDARD) ถอดจากยอดสุทธิของหน้าด้วย extractVat เดิม (ดู
          computeQuotationPageSummary) — เอกสารหน้าเดียว Output เดิมทุกประการ */}
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
        pagination={{
          pages: paginateRows(quotation.items, capacityForDocument(template, "QUOTATION")).map((pageItems) => ({
            items: pageItems,
            summary: computeQuotationPageSummary(pageItems, quotation.vatRateSnapshot ?? 0),
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
