import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { computeOrderPreview } from "@/lib/order-preview";
import { PrintButton } from "@/components/print-button";
import { printPageStyle } from "@/lib/print-settings";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function OrderPrintPage({ params }: { params: { id: string } }) {
  const [order, company] = await Promise.all([
    db.order.findUnique({
      where: { id: params.id },
      include: { customer: true, branch: true, items: { include: { product: { include: { productType: true } } } } },
    }),
    getCompanySettings(),
  ]);
  if (!order) notFound();

  const preview = order.items.length > 0 ? await computeOrderPreview(order.id) : null;

  return (
    <div className="max-w-3xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: printPageStyle() }} />
      <PrintButton />

      <div className="bg-white border print:border-0 rounded-lg print:rounded-none p-8 text-sm">
        <div className="text-center mb-4">
          <div className="font-medium text-base">{company.name}</div>
          <div className="font-medium mt-3">ใบสั่งขาย (Sales Order) — เอกสารภายใน ไม่ใช่เอกสารสำหรับลูกค้า</div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-b py-3 mb-3">
          <div>
            <div>
              <span className="text-gray-500">ลูกค้า:</span> {order.customer.companyName}
            </div>
            <div>
              <span className="text-gray-500">สาขา:</span> {order.branch.name}
            </div>
            {order.placeToDelivery && (
              <div>
                <span className="text-gray-500">สถานที่ส่งสินค้า:</span> {order.placeToDelivery}
              </div>
            )}
          </div>
          <div className="text-right">
            <div>
              <span className="text-gray-500">เลขที่:</span> {order.orderNumber}
            </div>
            <div>
              <span className="text-gray-500">วันที่:</span> {order.orderDate.toLocaleDateString("th-TH")}
            </div>
            {order.reference && (
              <div>
                <span className="text-gray-500">อ้างอิง:</span> {order.reference}
              </div>
            )}
          </div>
        </div>

        <table className="w-full mb-3">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1">SKU</th>
              <th className="text-left py-1">รายการ</th>
              <th className="text-left py-1">ประเภท</th>
              <th className="text-right py-1">จำนวน</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-dashed">
                <td className="py-1 font-mono">{item.product.sku}</td>
                <td className="py-1">{item.descriptionOverride || item.product.name}</td>
                <td className="py-1">{item.product.productType.name}</td>
                <td className="text-right py-1">
                  {Number(item.quantity)} {item.product.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {preview && (
          <div className="space-y-2 mb-4">
            {preview.groups.map((g) => (
              <div key={g.productTypeId} className="flex justify-between text-xs bg-gray-50 rounded px-3 py-1.5">
                <span>{g.productTypeName}</span>
                <span>
                  Gross {money(g.grossAmount)} · ส่วนลด {money(g.discountAmount)} · Net {money(g.netAmount)}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-medium pt-2 border-t">
              <span>รวมสุทธิ (จะแยกเป็น {preview.groups.length} บิลตามประเภทสินค้า)</span>
              <span>{money(preview.grandNet)}</span>
            </div>
          </div>
        )}

        {order.note && <div className="text-xs text-gray-600">หมายเหตุ: {order.note}</div>}
      </div>
    </div>
  );
}
