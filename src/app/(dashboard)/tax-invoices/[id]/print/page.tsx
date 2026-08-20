import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { toThaiBahtText } from "@/lib/thai-baht-text";
import { PrintButton } from "@/components/print-button";
import { printPageStyle } from "@/lib/print-settings";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function TaxInvoicePrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "taxInvoice.create")) redirect("/");

  const [taxInvoice, company] = await Promise.all([
    db.taxInvoice.findUnique({ where: { id: params.id }, include: { items: true, customer: true } }),
    getCompanySettings(),
  ]);
  if (!taxInvoice) notFound();

  return (
    <div className="max-w-3xl mx-auto">
      <style
        dangerouslySetInnerHTML={{
          __html: printPageStyle(),
        }}
      />

      <PrintButton />

      <div className="bg-white border print:border-0 rounded-lg print:rounded-none p-8 text-sm">
        <div className="text-center mb-4">
          <div className="font-medium text-base">{company.name}</div>
          {company.address && <div className="text-xs text-gray-600">{company.address}</div>}
          {company.phone && <div className="text-xs text-gray-600">โทร {company.phone}</div>}
          {company.taxId && <div className="text-xs text-gray-600">เลขประจำตัวผู้เสียภาษี {company.taxId}</div>}
          <div className="font-medium mt-3">ใบกำกับภาษี / ใบเสร็จรับเงิน — TAX INVOICE / RECEIPT</div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-b py-3 mb-3">
          <div>
            <div>
              <span className="text-gray-500">ลูกค้า:</span> {taxInvoice.customerNameSnapshot}
            </div>
            <div>
              <span className="text-gray-500">เลขประจำตัวผู้เสียภาษี:</span> {taxInvoice.taxIdSnapshot ?? "-"}
            </div>
            <div>
              <span className="text-gray-500">ที่อยู่:</span> {taxInvoice.addressSnapshot ?? "-"}
            </div>
          </div>
          <div className="text-right">
            <div>
              <span className="text-gray-500">เลขที่:</span> {taxInvoice.taxInvoiceNumber}
            </div>
            <div>
              <span className="text-gray-500">วันที่:</span> {taxInvoice.taxInvoiceDate.toLocaleDateString("th-TH")}
            </div>
            <div>
              <span className="text-gray-500">รหัสลูกค้า:</span> {taxInvoice.customer.code}
            </div>
          </div>
        </div>

        <table className="w-full mb-3">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1">รายการ</th>
              <th className="text-right py-1">จำนวน</th>
              <th className="text-right py-1">ราคา/หน่วย</th>
              <th className="text-right py-1">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {taxInvoice.items.map((item) => (
              <tr key={item.id} className="border-b border-dashed">
                <td className="py-1">{item.description}</td>
                <td className="text-right py-1">
                  {Number(item.quantity)} {item.unit}
                </td>
                <td className="text-right py-1">{money(item.unitPrice)}</td>
                <td className="text-right py-1">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-3">
          <div className="w-64 space-y-1">
            <div className="flex justify-between">
              <span>มูลค่าสินค้า / Value Amount</span>
              <span>{money(taxInvoice.valueAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>ภาษีมูลค่าเพิ่ม / VAT {Number(taxInvoice.vatPct)}%</span>
              <span>{money(taxInvoice.vatAmount)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1">
              <span>สุทธิ / Net Amount</span>
              <span>{money(taxInvoice.netAmount)}</span>
            </div>
          </div>
        </div>

        <div className="text-xs mb-8">({toThaiBahtText(taxInvoice.netAmount)})</div>

        <div className="grid grid-cols-3 gap-4 text-center text-xs pt-8">
          <div>
            <div className="border-t border-gray-400 pt-1">ผู้รับสินค้า / Received By</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-1">ผู้ส่งสินค้า / Sent By</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-1">ผู้มีอำนาจอนุมัติ / Manager</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
        </div>
      </div>
    </div>
  );
}
