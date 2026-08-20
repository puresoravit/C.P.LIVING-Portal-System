import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { toThaiBahtText } from "@/lib/thai-baht-text";
import { PrintButton } from "@/components/print-button";
import { printPageStyle } from "@/lib/print-settings";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

const CREDIT_DAYS: Record<string, number> = { CASH: 0, NET30: 30, NET60: 60, NET90: 90 };

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function BillingNotePrintPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "billingNote.create")) redirect("/");

  const [note, company] = await Promise.all([
    db.billingNote.findUnique({ where: { id: params.id }, include: { invoices: true } }),
    getCompanySettings(),
  ]);
  if (!note) notFound();

  const creditDays = CREDIT_DAYS[note.creditTermSnapshot] ?? 0;

  return (
    <div className="max-w-3xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: printPageStyle() }} />
      <PrintButton />

      <div className="bg-white border print:border-0 rounded-lg print:rounded-none p-8 text-sm">
        <div className="text-center mb-4">
          <div className="font-medium text-base">{company.name}</div>
          {company.address && <div className="text-xs text-gray-600">{company.address}</div>}
          {company.phone && <div className="text-xs text-gray-600">โทร {company.phone}</div>}
          {company.taxId && <div className="text-xs text-gray-600">เลขประจำตัวผู้เสียภาษี {company.taxId}</div>}
          <div className="font-medium mt-3">ใบวางบิล / BILLING NOTE</div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-b py-3 mb-3">
          <div>
            <div>
              <span className="text-gray-500">ลูกค้า:</span> {note.customerNameSnapshot}
            </div>
            <div>
              <span className="text-gray-500">เลขประจำตัวผู้เสียภาษี:</span> {note.taxIdSnapshot ?? "-"}
            </div>
          </div>
          <div className="text-right">
            <div>
              <span className="text-gray-500">เลขที่:</span> {note.billingNoteNumber}
            </div>
            <div>
              <span className="text-gray-500">วันที่:</span> {note.billingNoteDate.toLocaleDateString("th-TH")}
            </div>
          </div>
        </div>

        <p className="text-xs mb-2">บริษัทฯ ขอแจ้งรายละเอียดใบกำกับที่ครบกำหนดชำระแล้ว ดังต่อไปนี้</p>

        <table className="w-full mb-3">
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

        <div className="text-xs mb-8">({toThaiBahtText(note.totalAmount)})</div>

        <div className="grid grid-cols-2 gap-4 text-center text-xs pt-8">
          <div>
            <div className="border-t border-gray-400 pt-1">ผู้รับวางบิล / Received By</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-1">ผู้ส่งวางบิล / Delivery By</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
        </div>
      </div>
    </div>
  );
}
