import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { computeOrderPreview, UNSPECIFIED_TYPE_LABEL } from "@/lib/order-preview";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PrintPage } from "@/components/print/print-page";
import { PrintDocumentHeader } from "@/components/print/print-document-header";
import { PrintDocumentTitle } from "@/components/print/print-document-title";
import { PrintCustomerInfo } from "@/components/print/print-customer-info";
import { CopyDocumentNumber } from "@/components/copy-document-number";
import { PrintPageLabel } from "@/components/print/print-pagination-parts";
import { estimatePageCapacity, paginateRows, CLASSIC_HEADER_ESTIMATE_MM, DOC_PAGE_RESERVES_MM } from "@/lib/print-pagination";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// Order เป็นเอกสารภายใน (Sales Order) ไม่ใช่เอกสารสำหรับลูกค้า ไม่มี VAT และไม่เคยมี
// Signature Block มาก่อน — Phase D ไม่เพิ่มส่วนใหม่ที่ไม่เคยมี คงพฤติกรรม/field เดิม
// ทั้งหมด เปลี่ยนเฉพาะ Presentation ให้ใช้ Shared Header/Title/CustomerInfo Layout
export default async function OrderPrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "order.create")) redirect("/");

  const [order, company] = await Promise.all([
    db.order.findUnique({
      where: { id: params.id },
      include: { customer: true, branch: true, items: { include: { product: { include: { productType: true } } } } },
    }),
    getCompanySettings(),
  ]);
  if (!order) notFound();

  const preview = order.items.length > 0 ? await computeOrderPreview(order.id) : null;

  // R8 — Document Pagination: เอกสารภายในนี้ไม่ได้ใช้ Template Settings (Hardcode text-xs/
  // py-1 = 12px/4px มาแต่เดิม) จึงคำนวณความจุด้วยค่าคงที่เดียวกันนั้นตรงๆ — Summary ของ
  // เอกสารนี้เป็น "Preview แยกกลุ่มส่วนลดสด" (คำนวณจาก Pricing Engine ทั้งเอกสาร ไม่ใช่
  // Snapshot ต่อรายการ) จึงแบ่งหน้าเฉพาะแถวรายการ แล้วคง Summary กลุ่มไว้หน้าสุดท้าย
  // ตามเดิม (ไม่มี Per-page Summary — ไม่มีคอลัมน์จำนวนเงินต่อแถวให้รวมอยู่แล้ว)
  const capacity = estimatePageCapacity({
    bodyFontSizePx: 12,
    rowPaddingPx: 4,
    contentPaddingMm: 0,
    headerHeightMm: CLASSIC_HEADER_ESTIMATE_MM,
    ...DOC_PAGE_RESERVES_MM.SALES_ORDER,
  });
  const pages = paginateRows(order.items, capacity);
  const pageCount = pages.length;

  const headerNode = (
    <>
      <PrintDocumentHeader company={company} />
      <PrintDocumentTitle titleTh="ใบสั่งขาย (เอกสารภายใน ไม่ใช่เอกสารสำหรับลูกค้า)" titleEn="SALES ORDER (INTERNAL USE ONLY)" />

      <PrintCustomerInfo
        left={[
          { label: "ลูกค้า", value: order.customer.companyName },
          { label: "สาขา", value: order.branch?.name ?? "-" },
        ]}
        right={[
          {
            label: "เลขที่",
            value: (
              <span className="inline-flex items-center gap-1">
                {order.orderNumber}
                <CopyDocumentNumber value={order.orderNumber} />
              </span>
            ),
          },
          { label: "วันที่", value: order.orderDate.toLocaleDateString("th-TH") },
          ...(order.reference ? [{ label: "อ้างอิง", value: order.reference }] : []),
        ]}
        shippingAddress={order.placeToDelivery}
      />
    </>
  );

  return (
    <PrintPage backHref={`/orders/${order.id}`}>
      {pages.map((pageItems, idx) => {
        const isLast = idx === pageCount - 1;
        return (
          <section key={idx} className="print-doc-page">
            {headerNode}
            <PrintPageLabel pageNo={idx + 1} pageCount={pageCount} />

            <table className="print-table w-full mb-1.5 text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 font-mono w-16">รหัส</th>
                  <th className="text-left py-1">รายการ</th>
                  <th className="text-left py-1">กลุ่มส่วนลด</th>
                  <th className="text-left py-1">ขนาด</th>
                  <th className="text-right py-1">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={item.id} className="border-b border-dashed">
                    <td className="py-1 font-mono">{item.product.sku}</td>
                    <td className="py-1">{item.descriptionOverride || item.product.name}</td>
                    <td className="py-1">{item.product.productType?.name ?? UNSPECIFIED_TYPE_LABEL}</td>
                    {/* ดึง Size สดจาก Product Master ได้เลย (ไม่ snapshot) ตามที่อนุมัติใน Phase C
                        — Order เป็นเอกสารภายในพิมพ์วันเดียวกับที่ขาย ต่างจาก Invoice ที่ต้อง
                        คงสภาพย้อนหลัง */}
                    <td className="py-1">{item.product.size ?? ""}</td>
                    <td className="text-right py-1">
                      {Number(item.quantity)} {item.product.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex-1" />

            {isLast && (
              <div className="print-keep-together">
                {preview && (
                  <div className="space-y-1.5 mb-2 text-xs">
                    {preview.groups.map((g) => (
                      <div key={g.productTypeId} className="flex justify-between bg-gray-50 rounded px-3 py-1.5">
                        <span>{g.productTypeName}</span>
                        <span>
                          จำนวนเงิน {money(g.grossAmount)} · ส่วนลด {money(g.discountAmount)} · Net {money(g.netAmount)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium pt-1.5 border-t">
                      <span>รวมสุทธิ (จะแยกเป็น {preview.groups.length} บิลตามกลุ่มส่วนลด)</span>
                      <span>{money(preview.grandNet)} บาท</span>
                    </div>
                  </div>
                )}

                {order.note && <div className="text-xs text-gray-600">หมายเหตุ: {order.note}</div>}
              </div>
            )}
          </section>
        );
      })}
    </PrintPage>
  );
}
