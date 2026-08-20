import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { toThaiBahtText } from "@/lib/thai-baht-text";
import { PrintButton } from "@/components/print-button";
import { markInvoicePrinted } from "../../actions";
import { printPageStyle } from "@/lib/print-settings";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function InvoicePrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const [invoice, company] = await Promise.all([
    db.invoice.findUnique({ where: { id: params.id }, include: { items: true, customer: true } }),
    getCompanySettings(),
  ]);
  if (!invoice) notFound();

  const markPrintedAction = markInvoicePrinted.bind(null, invoice.id);

  return (
    <div className="max-w-3xl mx-auto">
      {/* ข้อ 33: paper size/margin ตรงนี้เป็นจุดเดียวที่ต้องแก้ถ้าจะปรับ layout
          สำหรับกระดาษต่อเนื่อง — แยกจาก business logic ทั้งหมด (แค่ CSS) */}
      <style
        dangerouslySetInnerHTML={{
          __html: printPageStyle(),
        }}
      />

      <PrintButton markPrintedAction={markPrintedAction} />

      <div className="bg-white border print:border-0 rounded-lg print:rounded-none p-8 text-sm">
        <div className="text-center mb-4">
          <div className="font-medium text-base">{company.name}</div>
          {company.address && <div className="text-xs text-gray-600">{company.address}</div>}
          {company.phone && <div className="text-xs text-gray-600">โทร {company.phone}</div>}
          <div className="font-medium mt-3">ใบส่งของชั่วคราว / INVOICE</div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-b py-3 mb-3">
          <div>
            <div>
              <span className="text-gray-500">ลูกค้า:</span> {invoice.customerNameSnapshot}
            </div>
            <div>
              <span className="text-gray-500">ที่อยู่:</span> {invoice.addressSnapshot ?? "-"}
            </div>
            {invoice.placeToDelivery && (
              <div>
                <span className="text-gray-500">สถานที่ส่งสินค้า:</span> {invoice.placeToDelivery}
              </div>
            )}
          </div>
          <div className="text-right">
            <div>
              <span className="text-gray-500">เลขที่:</span> {invoice.invoiceNumber}
            </div>
            <div>
              <span className="text-gray-500">วันที่:</span> {invoice.invoiceDate.toLocaleDateString("th-TH")}
            </div>
            <div>
              <span className="text-gray-500">รหัสลูกค้า:</span> {invoice.customer.code}
            </div>
          </div>
        </div>

        <table className="w-full mb-3">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1">รายการ</th>
              <th className="text-left py-1">ขนาด</th>
              <th className="text-right py-1">จำนวน</th>
              <th className="text-right py-1">ราคา/หน่วย</th>
              <th className="text-right py-1">ส่วนลด</th>
              <th className="text-right py-1">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-dashed">
                <td className="py-1">{item.productNameSnapshot}</td>
                <td className="py-1">{item.sizeSnapshot ?? ""}</td>
                <td className="text-right py-1">
                  {Number(item.quantity)} {item.unitSnapshot}
                </td>
                <td className="text-right py-1">{money(item.unitPriceSnapshot)}</td>
                <td className="text-right py-1">{money(item.discountAmount)}</td>
                <td className="text-right py-1">{money(item.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-3">
          <div className="w-64 space-y-1">
            <div className="flex justify-between">
              <span>รวม / Total</span>
              <span>{money(invoice.grossAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>ส่วนลด / Discount</span>
              <span>{money(invoice.discountAmount)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1">
              <span>สุทธิ / Net Amount</span>
              <span>{money(invoice.grandTotal)}</span>
            </div>
          </div>
        </div>

        <div className="text-xs mb-6">({toThaiBahtText(invoice.grandTotal)})</div>

        <div className="text-xs text-gray-600 mb-8">
          ได้รับสินค้าครบถ้วนตามรายการ ตรวจสอบแล้วอยู่ในสภาพสมบูรณ์ ไม่มีความเสียหายใดๆ
          หากเกิดความเสียหายหรือชำรุดภายหลังจากวันรับมอบ จะไม่ถือเป็นความรับผิดชอบของผู้ขาย
          <span className="float-right">ทะเบียนรถยนต์ ____________________</span>
        </div>

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
