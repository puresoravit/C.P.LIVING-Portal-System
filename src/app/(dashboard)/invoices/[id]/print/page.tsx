import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { toThaiBahtText } from "@/lib/thai-baht-text";
import { markInvoicePrinted, markInvoiceSheetPrinted } from "../../actions";
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
import { HeaderLogoElement, HeaderTextLine, HeaderTitleLine, HeaderDocNumberDateBlock } from "@/components/print/header-elements";
import { InvoicePrintBody } from "@/components/print/invoice-print-body";
import { getPrintTemplateSettings, type PrintBlockKey, type HeaderElementKey, logoHeightMm } from "@/lib/print-template-settings";
import { capacityForDocument, paginateRows, computeItemsPageSummary } from "@/lib/print-pagination";

// Invoice ในระบบนี้คือ "ใบส่งของชั่วคราว" — ไม่มี VAT ตามที่ยืนยันไว้ตั้งแต่แรก
// (confirmOrder() ตั้ง vatPct/vatAmount = 0 เสมอ) Phase D ไม่แตะตัวเลข/สูตรใดๆ
// เปลี่ยนเฉพาะ Presentation — ห้ามเพิ่ม VAT ให้เอกสารประเภทนี้เด็ดขาด
export default async function InvoicePrintPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string; queue?: string; sheet?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const [invoice, company, template] = await Promise.all([
    db.invoice.findUnique({
      where: { id: params.id },
      include: {
        // Owner Approve (2026-09-02) — Physical Sheet: ลำดับบรรทัดอ่านจาก lineNo ที่
        // Persist ตอนสร้าง (ใบเก่า lineNo เป็น null → ต่อท้ายตาม Insertion Order เดิม)
        items: { orderBy: { lineNo: { sort: "asc", nulls: "last" } } },
        customer: true,
        sheets: { where: { voidedAt: null, numberReleased: false }, orderBy: { sheetNo: "asc" } },
      },
    }),
    getCompanySettings(),
    getPrintTemplateSettings("INVOICE"),
  ]);
  if (!invoice) notFound();

  // Owner Approve (2026-09-02) — พิมพ์เฉพาะแผ่น: ?sheet=<sheetNo> (เลขแผ่นในชุด 1-based)
  const sheetParam = Number(searchParams.sheet) || null;
  const activeSheets = invoice.sheets;
  const scopedSheet = sheetParam ? activeSheets.find((s) => s.sheetNo === sheetParam) ?? null : null;

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

  // Owner Approve (2026-09-02) — Physical Sheet: PRINTED Checkpoint ระดับแผ่น —
  // โหมดพิมพ์ทั้งชุด = มาร์คทุกแผ่นที่ยังไม่พิมพ์ / โหมดพิมพ์เฉพาะแผ่น (?sheet=) = มาร์ค
  // แผ่นนั้นแผ่นเดียว — ใบเก่าไม่มีแผ่น = พฤติกรรมเดิมทุกประการ (ดู markInvoicePrinted)
  const fmtPrintedAt = (d: Date) =>
    d.toLocaleDateString("th-TH") + " " + d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const markPrintedAction =
    invoice.status === "CANCELLED"
      ? undefined
      : scopedSheet
        ? markInvoiceSheetPrinted.bind(null, invoice.id, scopedSheet.id)
        : markInvoicePrinted.bind(null, invoice.id);
  const isPrinted = scopedSheet
    ? scopedSheet.printedAt != null
    : activeSheets.length > 0
      ? activeSheets.every((s) => s.printedAt != null)
      : invoice.status === "PRINTED";
  const printedAtLabel = scopedSheet
    ? scopedSheet.printedAt
      ? fmtPrintedAt(scopedSheet.printedAt)
      : undefined
    : invoice.printedAt
      ? fmtPrintedAt(invoice.printedAt)
      : undefined;

  // Owner Approve (2026-09-02) — Physical Sheet: Header ทั้งก้อนกลายเป็นฟังก์ชันของ
  // "เลขเอกสารที่จะโชว์" — แต่ละแผ่นเรียกด้วยเลขแผ่นของตัวเอง (ใบเก่าไม่มีแผ่นเรียกด้วย
  // เลขใบหลักครั้งเดียว = ผลลัพธ์เดิมเป๊ะ) — เนื้อหา/Layout อื่นทุกส่วนเหมือนเดิมทุกประการ
  const numberNode = (docNumber: string) => (
    <span className="inline-flex items-center gap-1">
      {docNumber}
      <CopyDocumentNumber value={docNumber} />
    </span>
  );

  const buildBlocks = (docNumber: string): Record<PrintBlockKey, React.ReactNode> => ({
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
          { label: "ลูกค้า / Customer", value: invoice.customerNameSnapshot },
          { label: "ที่อยู่ / Address", value: invoice.addressSnapshot ?? "-" },
        ]}
        right={[
          { label: "เลขที่", value: numberNode(docNumber) },
          { label: "วันที่ / Date", value: invoice.invoiceDate.toLocaleDateString("th-TH") },
          { label: "รหัสลูกค้า / Customer Code", value: invoice.customer.code },
        ]}
        shippingAddress={invoice.placeToDelivery}
      />
    ),
  });

  // R6 Phase E.3 — ดู quotations/[id]/print/page.tsx สำหรับคำอธิบายเต็มของ Pattern นี้
  const hl = template.headerLayout;
  const buildHeaderElements = (docNumber: string): Partial<Record<HeaderElementKey, React.ReactNode>> =>
    hl
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
            <HeaderDocNumberDateBlock
              numberLabel="เลขที่"
              numberValue={numberNode(docNumber)}
              numberStyle={hl.docNumber}
              dateLabel="วันที่ / Date"
              dateValue={invoice.invoiceDate.toLocaleDateString("th-TH")}
              dateStyle={hl.docDate}
            />
          ),
          customerCode: <HeaderTextLine label="รหัสลูกค้า / Customer Code" value={invoice.customer.code} style={hl.customerCode} />,
          customerName: <HeaderTextLine label="ลูกค้า / Customer" value={invoice.customerNameSnapshot} style={hl.customerName} />,
          ...(invoice.addressSnapshot
            ? { customerAddress: <HeaderTextLine label="ที่อยู่ / Address" value={invoice.addressSnapshot} style={hl.customerAddress} /> }
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

  const buildHeader = (docNumber: string) =>
    template.headerLayout ? (
      <HeaderZone layout={template.headerLayout} elements={buildHeaderElements(docNumber)} />
    ) : (
      <PrintOrderedBlocks order={template.blockOrder} blocks={buildBlocks(docNumber)} />
    );

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
      //
      // Owner UAT (2026-08-31 รอบ 3) — เทียบรูปถ่ายกับโปรแกรมเดิม (ACC-Billing) บนเครื่องพิมพ์
      // เดียวกันแล้วพบว่าตัวอักษรของเราจางกว่าอย่างชัดเจน (สรุปว่าเป็นที่ไฟล์ไม่ใช่เครื่อง
      // พิมพ์) — ทดลองเปลี่ยน Font เป็น Tahoma (ตัวเลือกที่ระบบมีอยู่แล้วใน Print Template
      // Designer เดิม เส้นหนา/ช่องไฟโปร่งกว่า Sarabun ที่ Font Size เล็กๆ) เฉพาะใบส่งของ
      // ชั่วคราว — ยืนยันจากรอบ 3 ว่าคมชัดขึ้นจริง (ไม่มีข้อทักท้วงต่อ) — คงไว้
      //
      // Owner UAT (2026-08-31 รอบ 4) — เอาตัวคูณ ×1.3 ของ --print-body-size/
      // --print-heading-size ออก (เคยเพิ่มไว้ตอนรอบ 1 ตามคำขอ "ฟ้อนท์เล็กไปหมดเลย ปรับ
      // ใหญ่ขึ้น 30%") Owner สังเกตจากกระดาษจริงว่าตารางรายการที่ขยายไปแล้วดูใหญ่กว่าหัว
      // กระดาษ (ชื่อบริษัท/เลขที่/วันที่) อย่างเห็นได้ชัด เพราะหัวกระดาษ ณ ตอนนี้ Render
      // ผ่าน Custom Header Layout ที่ Owner ตั้งไว้เองใน Print Template Designer (fontSizePx
      // เป็นค่าคงที่ต่อ Element ไม่ได้ผูกกับ CSS Var พวกนี้เลย) ตัวคูณจึงไปโป่งเฉพาะตาราง/
      // สรุปยอด/ลายเซ็นเท่านั้น ทำให้ไม่สมมาตรกับหัวกระดาษ — และเป็นสาเหตุร่วมของปัญหา
      // ตกขอบขวาที่ทนอยู่หลายรอบด้วย (ตัวเลขที่บวมขึ้น 30% ต้องการพื้นที่คอลัมน์มากขึ้นตาม)
      // แก้ตรง Root Cause แล้วที่ table-layout:fixed (globals.css) แต่การเลิกขยายฟอนต์
      // เป็นการลดความเสี่ยงซ้อนอีกชั้น + แก้ปัญหาความไม่สมมาตรที่ Owner รายงานไปพร้อมกัน —
      // คงไว้แค่ font-bold + Tahoma + สีเข้ม (gray-900 จากรอบ 3) ซึ่งเพียงพอให้อ่านง่าย/
      // คมชัดขึ้นแล้วโดยไม่ต้องพึ่งการขยายขนาดเชิงเส้นที่ทำให้เกิดปัญหาตามมาหลายรอบ
      bodyClassName="font-bold"
      bodyStyle={{
        ["--print-font-family" as string]: `"Tahoma", "Segoe UI", ui-sans-serif, sans-serif`,
      }}
    >
      <RememberPrintSession
        docKey="invoice"
        active={printSessionActive}
        url={printSessionUrl}
        remaining={printSessionRemaining}
      />
      {/* Owner Approve (2026-09-02) — Physical Sheet: แถบเลือกแผ่น (Screen-only) เมื่อใบนี้
          มีหลายแผ่น — พิมพ์ทั้งชุด หรือเจาะพิมพ์/พิมพ์ซ้ำเฉพาะแผ่นด้วยเลขแผ่นจริง */}
      {activeSheets.length > 1 && (
        <div className="print:hidden mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">แผ่นเอกสาร:</span>
          <a
            href={`/invoices/${invoice.id}/print${printSessionQuery ? `?${printSessionQuery}` : ""}`}
            className={`rounded px-3 py-1 border ${!scopedSheet ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            ทั้งชุด ({activeSheets.length} แผ่น)
          </a>
          {activeSheets.map((s) => (
            <a
              key={s.id}
              href={`/invoices/${invoice.id}/print?${new URLSearchParams({ ...(printSessionQuery ? Object.fromEntries(printSessionParams) : {}), sheet: String(s.sheetNo) }).toString()}`}
              className={`rounded px-3 py-1 border font-mono ${scopedSheet?.id === s.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {s.sheetNumber}
              {s.printedAt ? " ✓" : ""}
            </a>
          ))}
        </div>
      )}
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
          // กระดาษจริง — Owner UAT (2026-08-31) สี text-gray-600 เดิมจางเกินไปเทียบกับ
          // ส่วนอื่นที่เป็นตัวหนา/สีเข้ม เปลี่ยนเป็น gray-900 ให้เข้มเท่ากัน — รอบ 4: Owner
          // ระบุจุดตัดบรรทัดตรงๆ (แยก 2 <div> แทนปล่อยให้ Wrap เองตามความกว้างคอลัมน์ที่
          // เปลี่ยนไปตามรอบ Font-size ต่างๆ) กันข้อความขึ้นบรรทัดผิดจุดโดยไม่ตั้งใจ — รอบ 5:
          // ขยายจาก 0.83 เท่าของ Body เป็นเท่ากับ Body เต็ม (Owner ขอใหญ่ขึ้นอีก 1 ระดับ)
          // + เพิ่ม mb จาก 2 เป็น 6 — Physical Print รอบ 5 ยืนยันว่ายังไม่พอ (Owner ระบุ
          // ชัดว่าต้องการ "ยกขึ้น" คืนพื้นที่เซ็นชื่อจริง ไม่ใช่แค่ขยับเล็กน้อย) — รอบ 6:
          // เพิ่มเป็น mb-10 (40px จาก 8px เดิม รวม +32px) เด็ดขาดกว่าเดิมชัดเจน + เอา +8px
          // ที่เคยเติมก่อนหน้าข้อความรับรอง (ในกล่อง Summary) ออก ให้พื้นที่ทั้งหมดไปอยู่
          // "หลัง" ข้อความรับรอง ก่อนถึงเส้นลายเซ็นจริงๆ ตามที่ Owner ต้องการเป๊ะ
          <div className="text-[length:var(--print-body-size)] text-gray-900 mb-10">
            <div>ได้รับสินค้าครบถ้วนตามรายการ ตรวจสอบแล้วอยู่ในสภาพสมบูรณ์ ไม่มีความเสียหายใดๆ</div>
            <div>หากเกิดความเสียหายหรือชำรุดภายหลังจากวันรับมอบ จะไม่ถือเป็นความรับผิดชอบของผู้ขาย</div>
            <div>ทะเบียนรถยนต์ ____________________</div>
          </div>
        }
        pagination={{
          // Owner Approve (2026-09-02) — Physical Sheet: ใบที่มีแผ่น Persist ไว้แล้ว (ใบใหม่
          // ทุกใบตั้งแต่ Feature นี้) เรนเดอร์ตามแผ่นจริงตรงๆ — แต่ละแผ่นมี Header ของตัวเอง
          // (เลขที่ = เลขแผ่น) + ป้ายหน้า/บทบาทตามตำแหน่งจริงในชุดแม้พิมพ์เฉพาะแผ่น
          // (?sheet=) — ใบเก่าไม่มีแผ่น = Runtime Pagination เดิมทุกประการ
          pages:
            activeSheets.length > 0
              ? (scopedSheet ? [scopedSheet] : activeSheets).map((sheet) => {
                  const sheetItems = invoice.items.filter((it) => it.sheetId === sheet.id);
                  return {
                    items: sheetItems,
                    summary: computeItemsPageSummary(sheetItems),
                    header: buildHeader(sheet.sheetNumber),
                    label: { pageNo: sheet.sheetNo, pageCount: activeSheets.length },
                    isFinalSheet: sheet.sheetNo === activeSheets.length,
                    showPageSummary: activeSheets.length > 1,
                    startIndex: (sheetItems[0]?.lineNo ?? 1) - 1,
                  };
                })
              : paginateRows(invoice.items, capacityForDocument(template, "INVOICE")).map((pageItems) => ({
                  items: pageItems,
                  summary: computeItemsPageSummary(pageItems),
                })),
          header: buildHeader(invoice.invoiceNumber),
          // Owner UAT (2026-08-31 รอบ 4) — เลิกขยาย Signature Block ตาม (เหตุผลเดียวกับ
          // bodyStyle ด้านบน — เมื่อไม่มีการขยายเอกสารส่วนอื่นแล้ว การคงขยาย Signature ไว้
          // อย่างเดียวจะกลับกลายเป็นใหญ่ไม่สมมาตรแทน) กลับไปใช้ค่าเริ่มต้นเหมือนเอกสาร
          // ประเภทอื่นทุกประการ
          signature: <PrintSignatureBlock footerNote={template.footerNote} />,
          // Owner UAT (2026-09-02) — แผ่นไม่จบ: Signature ครบชุดแต่ไม่มีข้อความขอบคุณ
          // (ข้อความอยู่เฉพาะแผ่นจบ — ดู print-signature-block.tsx)
          signatureNonFinal: <PrintSignatureBlock footerNote={template.footerNote} showFooterNote={false} />,
        }}
      />
    </PrintPage>
  );
}
