import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { cancelTaxInvoice } from "../actions";
import { toThaiBahtText } from "@/lib/thai-baht-text";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function TaxInvoiceDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "taxInvoice.create")) redirect("/");

  const taxInvoice = await db.taxInvoice.findUnique({
    where: { id: params.id },
    include: { items: true, referenceInvoice: true },
  });
  if (!taxInvoice) notFound();

  const status = STATUS_LABEL[taxInvoice.status];
  const cancelAction = cancelTaxInvoice.bind(null, taxInvoice.id);

  return (
    <div className="max-w-3xl">
      <a href="/tax-invoices" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบกำกับภาษี
      </a>

      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold font-mono">{taxInvoice.taxInvoiceNumber}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {taxInvoice.taxInvoiceDate.toLocaleDateString("th-TH")}
        {taxInvoice.referenceInvoice && (
          <>
            {" "}
            · อ้างอิงจาก{" "}
            <a href={`/invoices/${taxInvoice.referenceInvoice.id}`} className="text-blue-600 hover:underline font-mono">
              {taxInvoice.referenceInvoice.invoiceNumber}
            </a>
          </>
        )}
        {!taxInvoice.referenceInvoiceId && <> · สร้างแบบเลือกรายการเอง (Manual)</>}
      </p>

      <div className="bg-white border rounded-lg p-4 mb-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">ลูกค้า:</span> {taxInvoice.customerNameSnapshot}
          </div>
          <div>
            <span className="text-gray-500">เลขผู้เสียภาษี:</span> {taxInvoice.taxIdSnapshot ?? "-"}
          </div>
          <div>
            <span className="text-gray-500">สาขา:</span> {taxInvoice.branchNameSnapshot}
          </div>
          <div>
            <span className="text-gray-500">ที่อยู่:</span> {taxInvoice.addressSnapshot ?? "-"}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รายการ</th>
              <th className="px-4 py-2 font-medium text-right">จำนวน</th>
              <th className="px-4 py-2 font-medium">หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">ราคา/หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {taxInvoice.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2">{item.description}</td>
                <td className="px-4 py-2 text-right">{Number(item.quantity)}</td>
                <td className="px-4 py-2">{item.unit}</td>
                <td className="px-4 py-2 text-right">{money(item.unitPrice)}</td>
                <td className="px-4 py-2 text-right">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border rounded-lg p-4 mb-4 text-sm ml-auto max-w-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">มูลค่าสินค้า</span>
          <span>{money(taxInvoice.valueAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">VAT ({Number(taxInvoice.vatPct)}%)</span>
          <span>{money(taxInvoice.vatAmount)}</span>
        </div>
        <div className="flex justify-between font-medium border-t pt-1">
          <span>สุทธิ</span>
          <span>{money(taxInvoice.netAmount)}</span>
        </div>
        <div className="text-xs text-gray-400 pt-1">({toThaiBahtText(taxInvoice.netAmount)})</div>
      </div>

      <div className="flex gap-2">
        <a
          href={`/tax-invoices/${taxInvoice.id}/print`}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          พิมพ์เอกสาร
        </a>
        {taxInvoice.status !== "CANCELLED" && (
          <form action={cancelAction}>
            <button className="text-sm text-gray-600 hover:text-red-600 border rounded px-4 py-2">
              ยกเลิกใบกำกับภาษี
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
