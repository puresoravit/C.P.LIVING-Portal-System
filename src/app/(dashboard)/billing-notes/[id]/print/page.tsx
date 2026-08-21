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

const CREDIT_DAYS: Record<string, number> = { CASH: 0, NET30: 30, NET60: 60, NET90: 90 };

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Billing Note ไม่มี Item ของตัวเอง — รายการคือ Invoice ที่ถูกรวมบิล (ไม่ใช่ Product
// Item) ตามที่ยืนยันไว้ ห้ามเปลี่ยนเป็น Product Item Table ใน Phase D นี้
export default async function BillingNotePrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "billingNote.create")) redirect("/");

  const [note, company] = await Promise.all([
    db.billingNote.findUnique({ where: { id: params.id }, include: { invoices: true } }),
    getCompanySettings(),
  ]);
  if (!note) notFound();

  const creditDays = CREDIT_DAYS[note.creditTermSnapshot] ?? 0;

  return (
    <PrintPage>
      <PrintDocumentHeader company={company} />
      <PrintDocumentTitle titleTh="ใบวางบิล" titleEn="BILLING NOTE" />

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

      <p className="text-xs mb-1.5">บริษัทฯ ขอแจ้งรายละเอียดใบกำกับที่ครบกำหนดชำระแล้ว ดังต่อไปนี้</p>

      <table className="print-table w-full mb-1.5 text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left py-1">เลขที่ใบกำกับ</th>
            <th className="text-left py-1">วันที่</th>
            <th className="text-left py-1">วันครบกำหนด</th>
            <th className="text-right py-1">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {note.invoices.map((inv) => (
            <tr key={inv.id} className="border-b border-dashed">
              <td className="py-1">{inv.invoiceNumber}</td>
              <td className="py-1">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>
              <td className="py-1">{addDays(inv.invoiceDate, creditDays).toLocaleDateString("th-TH")}</td>
              <td className="text-right py-1">{money(inv.grandTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium">
            <td colSpan={3} className="py-1 text-right">
              รวม / Total
            </td>
            <td className="text-right py-1">{money(note.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="flex-1" />

      <div className="print-keep-together">
        <div className="text-xs mb-2">({toThaiBahtText(note.totalAmount)})</div>
        <PrintSignatureBlock fields={["ผู้รับวางบิล / Received By", "ผู้ส่งวางบิล / Delivery By"]} />
      </div>
    </PrintPage>
  );
}
