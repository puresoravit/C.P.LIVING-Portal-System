import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { cancelInvoice } from "../actions";
import { createTaxInvoiceFromInvoice } from "../../tax-invoices/actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-blue-100 text-blue-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: { items: true, order: true },
  });
  if (!invoice) notFound();

  const status = STATUS_LABEL[invoice.status];
  const cancelAction = cancelInvoice.bind(null, invoice.id);

  return (
    <div className="max-w-3xl">
      <a href="/invoices" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการ Invoice
      </a>

      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold font-mono">{invoice.invoiceNumber}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        จาก Order:{" "}
        <a href={`/orders/${invoice.order.id}`} className="text-blue-600 hover:underline font-mono">
          {invoice.order.orderNumber}
        </a>{" "}
        · {invoice.invoiceDate.toLocaleDateString("th-TH")} · ประเภท {invoice.productTypeCode}
      </p>

      <div className="bg-white border rounded-lg p-4 mb-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">ลูกค้า:</span> {invoice.customerNameSnapshot}
          </div>
          <div>
            <span className="text-gray-500">เลขผู้เสียภาษี:</span> {invoice.taxIdSnapshot ?? "-"}
          </div>
          <div>
            <span className="text-gray-500">สาขา:</span> {invoice.branchNameSnapshot}
          </div>
          <div>
            <span className="text-gray-500">ที่อยู่:</span> {invoice.addressSnapshot ?? "-"}
          </div>
          {invoice.placeToDelivery && (
            <div className="col-span-2">
              <span className="text-gray-500">สถานที่ส่งสินค้า:</span> {invoice.placeToDelivery}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          ข้อมูลด้านบนเป็น Snapshot ณ วันที่ออกเอกสาร — แก้ข้อมูลลูกค้า/สาขาในภายหลังจะไม่กระทบ Invoice ใบนี้ (ข้อ 27)
        </p>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">รายการ</th>
              <th className="px-4 py-2 font-medium text-right">จำนวน</th>
              <th className="px-4 py-2 font-medium text-right">ราคา/หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">Gross</th>
              <th className="px-4 py-2 font-medium text-right">ส่วนลด</th>
              <th className="px-4 py-2 font-medium text-right">สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2 font-mono">{item.skuSnapshot}</td>
                <td className="px-4 py-2">{item.productNameSnapshot}</td>
                <td className="px-4 py-2 text-right">
                  {Number(item.quantity)} {item.unitSnapshot}
                </td>
                <td className="px-4 py-2 text-right">{money(item.unitPriceSnapshot)}</td>
                <td className="px-4 py-2 text-right">{money(item.grossAmount)}</td>
                <td className="px-4 py-2 text-right">{money(item.discountAmount)}</td>
                <td className="px-4 py-2 text-right">{money(item.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border rounded-lg p-4 mb-4 text-sm ml-auto max-w-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">รวม (Gross)</span>
          <span>{money(invoice.grossAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">ส่วนลด ({Number(invoice.discountPct)}%)</span>
          <span>{money(invoice.discountAmount)}</span>
        </div>
        {Number(invoice.vatAmount) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">VAT ({Number(invoice.vatPct)}%)</span>
            <span>{money(invoice.vatAmount)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium border-t pt-1">
          <span>สุทธิ</span>
          <span>{money(invoice.grandTotal)}</span>
        </div>
      </div>

      {invoice.status !== "CANCELLED" && (
        <div className="flex gap-2">
          <a
            href={`/invoices/${invoice.id}/print`}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
          >
            พิมพ์เอกสาร
          </a>
          <form action={createTaxInvoiceFromInvoice.bind(null, invoice.id)}>
            <button className="text-sm text-gray-700 hover:text-gray-900 border rounded px-4 py-2">
              สร้างใบกำกับภาษีจากใบนี้ (VAT 100%)
            </button>
          </form>
          <form action={cancelAction}>
            <button className="text-sm text-gray-600 hover:text-red-600 border rounded px-4 py-2">
              ยกเลิก Invoice ใบนี้
            </button>
          </form>
        </div>
      )}
      {invoice.status === "CANCELLED" && (
        <a
          href={`/invoices/${invoice.id}/print`}
          className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 inline-block"
        >
          พิมพ์เอกสาร (Invoice นี้ถูกยกเลิกแล้ว)
        </a>
      )}

      <p className="text-xs text-gray-400 mt-4">
        การพิมพ์เอกสาร (PDF / กระดาษต่อเนื่อง) และใบกำกับภาษีแยกต่างหาก จะเพิ่มใน Phase 5
      </p>
    </div>
  );
}
