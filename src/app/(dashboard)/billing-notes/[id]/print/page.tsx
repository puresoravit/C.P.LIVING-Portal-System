import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { markBillingNotePrinted } from "../../actions";
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
import { BillingNotePrintBody } from "@/components/print/billing-note-print-body";
import { discountLinesByInvoiceId, liveTypeNamesByCode, resolveNoteGroupLabel } from "@/lib/billing-note-discount";
import { getPrintTemplateSettings, type PrintBlockKey, type HeaderElementKey, logoHeightMm } from "@/lib/print-template-settings";

const CREDIT_DAYS: Record<string, number> = { CASH: 0, NET30: 30, NET60: 60, NET90: 90 };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Billing Note ไม่มี Item ของตัวเอง — รายการคือ Invoice ที่ถูกรวมบิล (ไม่ใช่ Product
// Item) ตามที่ยืนยันไว้ ห้ามเปลี่ยนเป็น Product Item Table ใน Phase D นี้
export default async function BillingNotePrintPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string; queue?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "billingNote.create")) redirect("/");

  // Smoke Test R6 (2026-08-25) — Multi-Billing-Note Print Queue: เลือกหลายใบจากหน้า List
  // แล้วพิมพ์ต่อเนื่องทีละใบ — Pattern/Sanitization เดียวกับ Multi-Invoice Print Queue
  // (invoices/[id]/print) ทุกบรรทัด: back ต้องเป็น Internal Path, queue กรองเฉพาะ cuid + Cap 50
  const rawBack = searchParams.back;
  const queueBackHref = rawBack && rawBack.startsWith("/") && !rawBack.startsWith("//") ? rawBack : undefined;
  const queueIds = (searchParams.queue ?? "")
    .split(",")
    .filter((qid) => /^[a-z0-9]{20,32}$/i.test(qid))
    .slice(0, 50);
  const nextId = queueIds[0];
  let nextHref: string | undefined;
  if (nextId) {
    const nextParams = new URLSearchParams();
    if (queueBackHref) nextParams.set("back", queueBackHref);
    if (queueIds.length > 1) nextParams.set("queue", queueIds.slice(1).join(","));
    nextHref = `/billing-notes/${nextId}/print?${nextParams.toString()}`;
  }

  const [note, company, template] = await Promise.all([
    db.billingNote.findUnique({ where: { id: params.id }, include: { invoices: { orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }] } } }),
    getCompanySettings(),
    getPrintTemplateSettings("BILLING_NOTE"),
  ]);
  if (!note) notFound();

  const creditDays = CREDIT_DAYS[note.creditTermSnapshot] ?? 0;
  // Smoke Test (2026-08-25) — ยอด/% อ่านจาก Snapshot ตอนสร้าง (ตัวเลขนิ่งตลอดกาล) แต่
  // "ชื่อกลุ่ม" เชื่อมโยงสดกับชื่อปัจจุบันเสมอ (R5 — Owner ยืนยัน: เปลี่ยนชื่อกลุ่มแล้ว
  // พิมพ์ซ้ำต้องเห็นชื่อใหม่) Snapshot typeName เป็นแค่ Fallback เมื่อกลุ่มถูกลบไปแล้ว
  const discountByInvoice = discountLinesByInvoiceId(note.discountDetail);
  const liveNames = await liveTypeNamesByCode(note.invoices.map((inv) => inv.productTypeCode));
  const grossTotal = note.invoices.reduce((s, inv) => s + Number(inv.grandTotal), 0);
  // R9 — Owner: บนใบพิมพ์ต้องบอกกลุ่มส่วนลดเสมอ ไม่ว่าจะติ๊กใช้ส่วนลดหรือไม่ (ดูเหตุผลเต็ม
  // ที่ resolveNoteGroupLabel)
  const groupLabel = resolveNoteGroupLabel(
    note.invoices.map((inv) => liveNames.get(inv.productTypeCode) ?? "ไม่ระบุกลุ่มส่วนลด")
  );

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

  // R6 Phase E.3 — ดู quotations/[id]/print/page.tsx สำหรับคำอธิบายเต็มของ Pattern นี้ —
  // Billing Note ไม่มี customerCode/customerAddress/shippingAddress จริง (ตามฟอร์มเดิม)
  // จึงไม่ใส่ Key เหล่านั้นเข้าไปเลย
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
        titleTh: <HeaderTitleLine text="ใบวางบิล" style={hl.titleTh} />,
        titleEn: <HeaderTitleLine text="BILLING NOTE" style={hl.titleEn} />,
        docNumber: (
          <HeaderTextLine
            label="เลขที่"
            value={
              <span className="inline-flex items-center gap-1">
                {note.billingNoteNumber}
                <CopyDocumentNumber value={note.billingNoteNumber} />
              </span>
            }
            style={hl.docNumber}
          />
        ),
        docDate: <HeaderTextLine label="วันที่" value={note.billingNoteDate.toLocaleDateString("th-TH")} style={hl.docDate} />,
        customerName: <HeaderTextLine label="ลูกค้า" value={note.customerNameSnapshot} style={hl.customerName} />,
        customerTaxId: <HeaderTextLine label="เลขประจำตัวผู้เสียภาษี" value={note.taxIdSnapshot ?? "-"} style={hl.customerTaxId} />,
      }
    : {};

  // R5 — PRINTED Checkpoint (Pattern เดียวกับหน้า Print ของ Invoice): CANCELLED ไม่ส่ง
  // Action เลย (พิมพ์ซ้ำดูได้แต่ไม่มาร์ค), CONFIRMED ส่ง Action ให้ Confirmation Modal
  // ถามหลังพิมพ์ 9×11 จริง, PRINTED โชว์วันที่ที่มาร์คไว้แทนปุ่ม
  const markAction = note.status === "CONFIRMED" ? markBillingNotePrinted.bind(null, note.id) : undefined;

  return (
    <PrintPage
      templateSettings={template}
      docType="BILLING_NOTE"
      canEditTemplate={can((session?.user as any)?.role, "user.manage")}
      backHref={queueBackHref ?? `/billing-notes/${note.id}`}
      markPrintedAction={markAction}
      isPrinted={note.status === "PRINTED"}
      printedAtLabel={note.printedAt ? note.printedAt.toLocaleString("th-TH") : undefined}
      nextHref={nextHref}
      nextRemaining={queueIds.length}
    >
      {template.headerLayout ? (
        <HeaderZone layout={template.headerLayout} elements={headerElements} />
      ) : (
        <PrintOrderedBlocks order={template.blockOrder} blocks={blocks} />
      )}

      <BillingNotePrintBody
        invoices={note.invoices.map((inv) => {
          const line = discountByInvoice.get(inv.id);
          return {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDateLabel: inv.invoiceDate.toLocaleDateString("th-TH"),
            dueDateLabel: addDays(inv.invoiceDate, creditDays).toLocaleDateString("th-TH"),
            grandTotal: inv.grandTotal,
            discountAmount: line?.amount,
            discountPct: line?.pct,
            alreadyDiscounted: line?.alreadyDiscounted,
            typeName: liveNames.get(inv.productTypeCode) ?? line?.typeName,
          };
        })}
        totalAmount={note.totalAmount}
        amountInWords={toThaiBahtText(note.totalAmount)}
        footerNote={template.footerNote}
        showDiscount={note.applyDiscount}
        grossTotal={grossTotal}
        discountTotal={grossTotal - Number(note.totalAmount)}
        groupLabel={groupLabel}
      />
    </PrintPage>
  );
}
