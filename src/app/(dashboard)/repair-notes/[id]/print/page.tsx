import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
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
import { HeaderLogoElement, HeaderTextLine, HeaderTitleLine, HeaderDocNumberDateBlock } from "@/components/print/header-elements";
import { RepairNotePrintBody } from "@/components/print/repair-note-print-body";
import { getPrintTemplateSettings, type PrintBlockKey, type HeaderElementKey, logoHeightMm } from "@/lib/print-template-settings";
import { capacityForDocument, paginateRows } from "@/lib/print-pagination";

// Repair/Return Note ไม่มีราคา/VAT เลย (ไม่ใช่เอกสารขาย) — ไม่มี Size column เพราะ
// RepairReturnNoteItem ยังไม่มี field นี้ (ตามที่ตกลงไว้ ยังไม่แก้ Data Model รอบนี้)
// โครง print-table ที่ใช้ร่วมกับเอกสารอื่นออกแบบให้เพิ่ม column ในอนาคตได้โดยไม่ต้อง
// รื้อ Layout ใหญ่ — แค่เพิ่ม <th>/<td> ในตารางนี้เมื่อมี field จริง
export default async function RepairNotePrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "repairNote.create")) redirect("/");

  const [note, company, template] = await Promise.all([
    db.repairReturnNote.findUnique({ where: { id: params.id }, include: { items: true, customer: true } }),
    getCompanySettings(),
    getPrintTemplateSettings("REPAIR_NOTE"),
  ]);
  if (!note) notFound();

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
    title: <PrintDocumentTitle titleTh="ใบส่งคืนสินค้าฝากซ่อม" titleEn="REPAIR / RETURN NOTE" />,
    customerInfo: (
      <PrintCustomerInfo
        left={[
          { label: "ลูกค้า / Customer", value: note.customerNameSnapshot },
          { label: "ที่อยู่ / Address", value: note.addressSnapshot ?? "-" },
        ]}
        right={[
          {
            label: "เลขที่",
            value: (
              <span className="inline-flex items-center gap-1">
                {note.noteNumber}
                <CopyDocumentNumber value={note.noteNumber} />
              </span>
            ),
          },
          { label: "วันที่ / Date", value: note.noteDate.toLocaleDateString("th-TH") },
          { label: "รหัสลูกค้า / Customer Code", value: note.customer.code },
          ...(note.reference ? [{ label: "อ้างถึง", value: note.reference }] : []),
        ]}
        shippingAddress={note.placeToDelivery}
      />
    ),
  };

  // R6 Phase E.3 — ดู quotations/[id]/print/page.tsx สำหรับคำอธิบายเต็มของ Pattern นี้ —
  // Repair Note ไม่มี customerTaxId จริง (ไม่ใช่เอกสารขาย) จึงไม่ใส่ Key นั้นเข้าไปเลย
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
        titleTh: <HeaderTitleLine text="ใบส่งคืนสินค้าฝากซ่อม" style={hl.titleTh} />,
        titleEn: <HeaderTitleLine text="REPAIR / RETURN NOTE" style={hl.titleEn} />,
        docNumber: (
          <HeaderDocNumberDateBlock
            numberLabel="เลขที่"
            numberValue={
              <span className="inline-flex items-center gap-1">
                {note.noteNumber}
                <CopyDocumentNumber value={note.noteNumber} />
              </span>
            }
            numberStyle={hl.docNumber}
            dateLabel="วันที่ / Date"
            dateValue={note.noteDate.toLocaleDateString("th-TH")}
            dateStyle={hl.docDate}
          />
        ),
        customerCode: <HeaderTextLine label="รหัสลูกค้า / Customer Code" value={note.customer.code} style={hl.customerCode} />,
        ...(note.reference ? { reference: <HeaderTextLine label="อ้างถึง" value={note.reference} style={hl.reference} /> } : {}),
        customerName: <HeaderTextLine label="ลูกค้า / Customer" value={note.customerNameSnapshot} style={hl.customerName} />,
        ...(note.addressSnapshot
          ? { customerAddress: <HeaderTextLine label="ที่อยู่ / Address" value={note.addressSnapshot} style={hl.customerAddress} /> }
          : {}),
        ...(note.placeToDelivery
          ? {
              shippingAddress: (
                <HeaderTextLine label="สถานที่ส่งสินค้า / Shipping Address" value={note.placeToDelivery} style={hl.shippingAddress} />
              ),
            }
          : {}),
      }
    : {};

  return (
    <PrintPage templateSettings={template} docType="REPAIR_NOTE" canEditTemplate={can((session?.user as any)?.role, "user.manage")} backHref={`/repair-notes/${note.id}`}>
      {/* R8 — Document Pagination: เอกสารนี้ไม่มีจำนวนเงิน — แบ่งหน้า + Header ซ้ำทุกหน้า
          หมายเหตุ/Signature หน้าสุดท้าย (ดู print-pagination.ts) */}
      <RepairNotePrintBody
        items={note.items}
        remark={note.remark}
        footerNote={template.footerNote}
        pagination={{
          pages: paginateRows(note.items, capacityForDocument(template, "REPAIR_NOTE")).map((pageItems) => ({
            items: pageItems,
            summary: null,
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
