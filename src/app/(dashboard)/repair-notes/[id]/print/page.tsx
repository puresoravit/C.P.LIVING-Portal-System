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
import { RepairNotePrintBody } from "@/components/print/repair-note-print-body";
import { getPrintTemplateSettings, type PrintBlockKey } from "@/lib/print-template-settings";

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
          { label: "ลูกค้า", value: note.customerNameSnapshot },
          { label: "ที่อยู่", value: note.addressSnapshot ?? "-" },
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
          { label: "วันที่", value: note.noteDate.toLocaleDateString("th-TH") },
          { label: "รหัสลูกค้า", value: note.customer.code },
          ...(note.reference ? [{ label: "อ้างถึง", value: note.reference }] : []),
        ]}
        shippingAddress={note.placeToDelivery}
      />
    ),
  };

  return (
    <PrintPage templateSettings={template}>
      <PrintOrderedBlocks order={template.blockOrder} blocks={blocks} />

      <RepairNotePrintBody items={note.items} remark={note.remark} footerNote={template.footerNote} />
    </PrintPage>
  );
}
