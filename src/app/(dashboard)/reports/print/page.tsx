import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { getPrintTemplateSettings } from "@/lib/print-template-settings";
import { fetchPrintedInvoiceList, fetchPrintedTaxInvoiceList } from "@/lib/reports";
import { PrintPage } from "@/components/print/print-page";
import { PrintDocumentHeader } from "@/components/print/print-document-header";
import { PrintDocumentTitle } from "@/components/print/print-document-title";

// R11 UAT (2026-08-27) — Owner: ต้องมีปุ่มสร้าง "แบบฟอร์มรายงาน" พิมพ์ได้จริงของ 8.1/8.2
// ไม่ใช่แค่ตารางบนหน้าจอ — หน้านี้เป็นแบบฟอร์มพิมพ์ของรายงานทั้งสองแบบ (?type=sales|tax)
// ใช้โครง PrintPage เดียวกับเอกสารจริง (หัวบริษัท/ปุ่มพิมพ์/Print Profile) แต่ไม่มี
// PRINTED Checkpoint — รายงานไม่ใช่เอกสารเลขที่ พิมพ์ซ้ำได้เสมอ ยอดคือ Snapshot ณ ตอนเปิด
// กติกาตัวเลขเดิมทุกประการ: นับเฉพาะใบสถานะ PRINTED (SOT) — 8.2 ไม่กรองลูกค้า/สาขา

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function dateTh(d: Date) {
  return d.toLocaleDateString("th-TH");
}

export default async function ReportPrintPage(props: {
  searchParams: Promise<{ type?: string; dateFrom?: string; dateTo?: string; customerId?: string; branchId?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "report.view")) redirect("/");

  const isTax = searchParams.type === "tax";
  const dateFrom = searchParams.dateFrom ? new Date(searchParams.dateFrom) : undefined;
  const dateTo = searchParams.dateTo ? new Date(searchParams.dateTo) : undefined;
  const customerId = searchParams.customerId || undefined;
  const branchId = searchParams.branchId || undefined;

  const [company, template, customer, branch] = await Promise.all([
    getCompanySettings(),
    getPrintTemplateSettings("INVOICE"),
    !isTax && customerId ? db.customer.findUnique({ where: { id: customerId }, select: { companyName: true } }) : null,
    !isTax && branchId ? db.branch.findUnique({ where: { id: branchId }, select: { name: true } }) : null,
  ]);

  const periodLabel =
    dateFrom || dateTo
      ? `ช่วงวันที่ ${dateFrom ? dateTh(dateFrom) : "ไม่ระบุ"} ถึง ${dateTo ? dateTh(dateTo) : "ไม่ระบุ"}`
      : "ทุกช่วงวันที่";
  const scopeParts = [periodLabel];
  if (customer) scopeParts.push(`ลูกค้า: ${customer.companyName}`);
  if (branch) scopeParts.push(`สาขา: ${branch.name}`);
  const generatedLabel = `พิมพ์เมื่อ ${new Date().toLocaleDateString("th-TH")} ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;

  const backHref = "/reports";
  const headCell = "py-1.5 px-2 font-semibold text-left border-b border-gray-800";
  const headCellR = "py-1.5 px-2 font-semibold text-right border-b border-gray-800";
  const cell = "py-1 px-2 border-b border-gray-200";
  const cellR = "py-1 px-2 border-b border-gray-200 text-right";

  let body: React.ReactNode;
  if (isTax) {
    const rows = await fetchPrintedTaxInvoiceList({ dateFrom, dateTo });
    const totals = rows.reduce(
      (a, r) => ({ value: a.value + r.valueAmount, vat: a.vat + r.vatAmount, net: a.net + r.netAmount }),
      { value: 0, vat: 0, net: 0 }
    );
    body = (
      <>
        <PrintDocumentTitle titleTh="รายงานใบกำกับภาษี (ภาษีขาย)" titleEn="SALES TAX REPORT" />
        <div className="text-center text-[length:var(--print-body-size)] text-gray-700 mb-3">
          {scopeParts.join(" · ")} · นับเฉพาะใบที่พิมพ์แล้ว
        </div>
        <table className="w-full text-[length:var(--print-body-size)]">
          <thead>
            <tr>
              <th className={headCell}>ลำดับ</th>
              <th className={headCell}>เลขที่ใบกำกับภาษี</th>
              <th className={headCell}>วันที่</th>
              <th className={headCell}>ชื่อลูกค้า</th>
              <th className={headCellR}>มูลค่าก่อน VAT</th>
              <th className={headCellR}>VAT</th>
              <th className={headCellR}>ยอดรวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className={cell}>{i + 1}</td>
                <td className={cell}>{r.taxInvoiceNumber}</td>
                <td className={cell}>{dateTh(r.taxInvoiceDate)}</td>
                <td className={cell}>{r.customerName}</td>
                <td className={cellR}>{money(r.valueAmount)}</td>
                <td className={cellR}>{money(r.vatAmount)}</td>
                <td className={cellR}>{money(r.netAmount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-400">
                  ไม่มีใบกำกับภาษีที่พิมพ์แล้วในช่วงวันที่นี้
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={4} className="py-1.5 px-2 text-right border-t border-gray-800">
                  รวม ({rows.length} ใบ)
                </td>
                <td className="py-1.5 px-2 text-right border-t border-gray-800">{money(totals.value)}</td>
                <td className="py-1.5 px-2 text-right border-t border-gray-800">{money(totals.vat)}</td>
                <td className="py-1.5 px-2 text-right border-t border-gray-800">{money(totals.net)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </>
    );
  } else {
    const rows = await fetchPrintedInvoiceList({ dateFrom, dateTo, customerId, branchId });
    const totals = rows.reduce(
      (a, r) => ({ gross: a.gross + r.gross, discount: a.discount + r.discount, grandTotal: a.grandTotal + r.grandTotal }),
      { gross: 0, discount: 0, grandTotal: 0 }
    );
    body = (
      <>
        <PrintDocumentTitle titleTh="รายงานยอดขาย (จากใบส่งของชั่วคราว)" titleEn="SALES REPORT" />
        <div className="text-center text-[length:var(--print-body-size)] text-gray-700 mb-3">
          {scopeParts.join(" · ")} · นับเฉพาะใบที่พิมพ์แล้ว
        </div>
        <table className="w-full text-[length:var(--print-body-size)]">
          <thead>
            <tr>
              <th className={headCell}>ลำดับ</th>
              <th className={headCell}>เลขที่ INV</th>
              <th className={headCell}>วันที่</th>
              <th className={headCell}>ชื่อบริษัท</th>
              <th className={headCellR}>จำนวนเงิน</th>
              <th className={headCellR}>ส่วนลด</th>
              <th className={headCellR}>สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className={cell}>{i + 1}</td>
                <td className={cell}>{r.invoiceNumber}</td>
                <td className={cell}>{dateTh(r.invoiceDate)}</td>
                <td className={cell}>{r.customerName}</td>
                <td className={cellR}>{money(r.gross)}</td>
                <td className={cellR}>{money(r.discount)}</td>
                <td className={cellR}>{money(r.grandTotal)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-400">
                  ไม่มีใบส่งของชั่วคราวที่พิมพ์แล้วในช่วงวันที่นี้
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={4} className="py-1.5 px-2 text-right border-t border-gray-800">
                  รวม ({rows.length} ใบ)
                </td>
                <td className="py-1.5 px-2 text-right border-t border-gray-800">{money(totals.gross)}</td>
                <td className="py-1.5 px-2 text-right border-t border-gray-800">{money(totals.discount)}</td>
                <td className="py-1.5 px-2 text-right border-t border-gray-800">{money(totals.grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </>
    );
  }

  return (
    <PrintPage templateSettings={template} backHref={backHref}>
      <PrintDocumentHeader
        company={company}
        logo={template.logo}
        logoSize={template.logoSize}
        showAddress={template.showAddress}
        showPhone={template.showPhone}
        showTaxId={template.showTaxId}
      />
      {body}
      <div className="mt-auto pt-4 text-right text-[10px] text-gray-500">{generatedLabel}</div>
    </PrintPage>
  );
}
