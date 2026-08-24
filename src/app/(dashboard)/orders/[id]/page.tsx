import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import {
  addOrderItem,
  removeOrderItem,
  confirmOrder,
  cancelOrder,
  duplicateOrder,
  editConfirmedOrder,
  updateOrderApplyDiscount,
  getSuggestedOrderItemPrice,
} from "../actions";
import { computeOrderPreview, UNSPECIFIED_TYPE_LABEL, displayProductTypeCode } from "@/lib/order-preview";
import { fetchOrderEditGuard } from "@/lib/order-edit-guard";
import { OrderItemEntryForm } from "@/components/order-item-entry-form";
import { OrderEditModal } from "@/components/order-edit-modal";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CancelButton } from "@/components/cancel-button";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field } from "@/components/form/fields";
import { CopyDocumentNumber } from "@/components/copy-document-number";
import { OrderInvoicePrintPanel } from "@/components/order-invoice-print-panel";

const LOCKED_REASON_LABEL: Record<"tax-invoice" | "billing-note", string> = {
  "tax-invoice": "ใบกำกับภาษี",
  "billing-note": "ใบวางบิล",
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "order.create")) redirect("/");
  // R6 Phase B — คุมว่าจะโชว์ลิงก์ไปหน้ารุ่นสินค้าตอนเลือกไซส์ที่ยังไม่มี Product จริงไหม
  const canManageProducts = can((session?.user as any)?.role, "product.edit");

  const order = await db.order.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      branch: true,
      items: { include: { product: { include: { productType: true } } } },
      invoices: true,
    },
  });
  if (!order) notFound();

  const isDraft = order.status === "DRAFT";
  const preview = order.items.length > 0 ? await computeOrderPreview(order.id) : null;
  const status = STATUS_LABEL[order.status];
  // Owner UAT — ราคา/หน่วย ต้องเห็นทันทีในตารางรายการเอง ไม่ใช่ต้องเลื่อนไปดูที่ Preview
  // แยกกลุ่มด้านล่างเท่านั้น (ให้ตรงกับ Layout ใบกำกับภาษีที่ Owner ระบุ) — Map นี้แค่
  // ดึงราคาที่ preview คำนวณสดอยู่แล้วมาโชว์ต่อบรรทัด ไม่มี Pricing Logic ใหม่ ไม่กระทบ
  // การคำนวณจริงตอน Confirm (ยังอ่านสดจาก computeOrderPreview เหมือนเดิมทุกประการ)
  const previewByItemId = new Map(preview?.groups.flatMap((g) => g.items).map((i) => [i.orderItemId, i]) ?? []);

  const addItemAction = addOrderItem.bind(null, order.id);
  // Owner UAT Round 3 — ข้อ 3: Bind ราคาแนะนำล่วงหน้าด้วย customerId/branchId/orderDate
  // ของเอกสารนี้จริง — เหลือแค่ productId ให้ Client เรียกตอนเลือกสินค้า
  const suggestPriceAction = getSuggestedOrderItemPrice.bind(null, order.customerId, order.branchId, order.orderDate);
  const confirmAction = confirmOrder.bind(null, order.id);
  const cancelAction = cancelOrder.bind(null, order.id);
  const editAction = editConfirmedOrder.bind(null, order.id);
  const applyDiscountAction = updateOrderApplyDiscount.bind(null, order.id);

  // E3 — Edit Confirmed Order: เช็คว่าแก้ไขได้หรือไม่เฉพาะตอน Order Confirmed แล้วเท่านั้น
  const editGuard = order.status === "CONFIRMED" ? await fetchOrderEditGuard(order.id) : null;
  const activeInvoiceCount = order.invoices.filter((inv) => inv.status !== "CANCELLED").length;
  const initialEditItems = order.items.map((item) => ({
    key: item.id,
    productId: item.productId,
    sku: item.product.sku,
    name: item.descriptionOverride || item.product.name,
    unit: item.product.unit,
    productTypeName: item.product.productType?.name ?? UNSPECIFIED_TYPE_LABEL,
    quantity: Number(item.quantity),
    descriptionOverride: item.descriptionOverride ?? "",
    sizeOverride: item.sizeOverride ?? "",
    // Owner UAT — ข้อ 4: เหมือน Quotation Edit ทุกประการ — Field แสดงผลอย่างเดียว แยกจาก
    // sizeOverride ที่ใช้ตอน Submit จริง (ห้ามปนกัน ดูเหตุผลเต็มที่ quotations/[id]/page.tsx)
    // — รายการ Size มาตรฐานไม่มีค่าใน sizeOverride เลย ต้อง Fallback ไปอ่าน product.size
    // (Order ไม่มี Snapshot Field ของตัวเอง — คำนวณสดผ่าน computeOrderPreview เสมอ บรรทัด
    // 102 ของ order-preview.ts ก็ Fallback แบบเดียวกันนี้อยู่แล้ว) เฉพาะตอนแสดงผลเท่านั้น
    sizeDisplay: item.sizeOverride ?? item.product.size ?? "",
    unitPriceOverride: item.unitPriceOverride != null ? Number(item.unitPriceOverride) : null,
    // Owner UAT Round 3 — ข้อ 3: ราคาปัจจุบันจริงจาก preview เดิม (เพื่อโชว์ใน Edit Modal
    // ตอนเปิดครั้งแรก) — ไม่ใช่ Field ใหม่ใน DB แค่ดึงจาก computeOrderPreview ที่คำนวณอยู่
    // แล้วมาแสดง
    displayPrice: previewByItemId.get(item.id)?.unitPrice != null ? Number(previewByItemId.get(item.id)!.unitPrice) : null,
  }));

  return (
    <div className="max-w-4xl">
      <a href="/orders" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการออเดอร์
      </a>

      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold font-mono flex items-center gap-1.5">
          {order.orderNumber}
          <CopyDocumentNumber value={order.orderNumber} />
        </h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {order.customer.companyName} / {order.branch?.name ?? "ไม่มีสาขา"} · {order.orderDate.toLocaleDateString("th-TH")}
        {order.reference && <> · อ้างอิง: {order.reference}</>}
        {order.placeToDelivery && (
          <>
            <br />
            สถานที่ส่งสินค้า: {order.placeToDelivery}
          </>
        )}
      </p>

      {isDraft && (
        <>
          <div className="bg-white border rounded-lg p-4 mb-4 flex items-center gap-3">
            <ActionForm action={applyDiscountAction} successMessage="บันทึกการตั้งค่าส่วนลดสำเร็จ" className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input id="applyDiscount" type="checkbox" name="applyDiscount" defaultChecked={order.applyDiscount} />
                ใช้ส่วนลด (ตามเงื่อนไขลูกค้า/สาขาที่ตั้งไว้)
              </label>
              <SubmitButton pendingLabel="กำลังบันทึก..." className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50 bg-white text-gray-900">
                บันทึกการตั้งค่า
              </SubmitButton>
            </ActionForm>
          </div>
          <div className="mb-4">
            <OrderItemEntryForm
              key={order.items.length}
              addAction={addItemAction}
              suggestPriceAction={suggestPriceAction}
              canManageProducts={canManageProducts}
            />
          </div>
        </>
      )}

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รหัสสินค้า</th>
              <th className="px-4 py-2 font-medium">รายการ</th>
              <th className="px-4 py-2 font-medium">ขนาด</th>
              <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
              <th className="px-4 py-2 font-medium text-right">จำนวน</th>
              <th className="px-4 py-2 font-medium">หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">ราคา/หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
              {isDraft && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => {
              const line = previewByItemId.get(item.id);
              return (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-2 font-mono">{item.product.sku}</td>
                  <td className="px-4 py-2">{item.descriptionOverride || item.product.name}</td>
                  <td className="px-4 py-2">{item.sizeOverride || item.product.size || "-"}</td>
                  <td className="px-4 py-2">{item.product.productType?.name ?? UNSPECIFIED_TYPE_LABEL}</td>
                  <td className="px-4 py-2 text-right">{Number(item.quantity)}</td>
                  <td className="px-4 py-2">{item.product.unit}</td>
                  <td className="px-4 py-2 text-right">{line ? money(line.unitPrice) : "-"}</td>
                  <td className="px-4 py-2 text-right">{line ? money(line.grossAmount) : "-"}</td>
                  {isDraft && (
                    <td className="px-4 py-2 text-right">
                      <ActionButton
                        action={removeOrderItem.bind(null, order.id, item.id)}
                        label="ลบ"
                        pendingLabel="กำลังลบ..."
                        successMessage="ลบรายการสำเร็จ"
                        className="text-xs text-gray-500 hover:text-red-600 border-0 p-0"
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {order.items.length === 0 && (
              <tr>
                <td colSpan={isDraft ? 9 : 8} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีรายการสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {preview && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <h2 className="font-medium text-sm mb-3">
            สรุปแยกตามกลุ่มส่วนลด (Preview) — จะแตกเป็น Invoice แยกใบตามนี้
          </h2>
          <div className="space-y-3">
            {preview.groups.map((g) => (
              <div key={g.productTypeId} className="border rounded p-3">
                <div className="font-medium text-sm mb-1">{g.productTypeName}</div>
                <ul className="text-xs text-gray-500 mb-2">
                  {g.items.map((i) => (
                    <li key={i.orderItemId}>
                      {i.sku} × {Number(i.quantity)} {i.unit} @ {money(i.unitPrice)} = {money(i.grossAmount)}
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <div>
                    จำนวนเงิน: <b>{money(g.grossAmount)}</b>
                  </div>
                  <div>
                    ส่วนลด {Number(g.discountPct)}%: <b>{money(g.discountAmount)}</b>
                  </div>
                  <div>
                    Net: <b>{money(g.netAmount)}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm font-medium">
            <div>
              รวมจำนวนเงิน: <b>{money(preview.grandGross)} บาท</b>
            </div>
            <div>
              รวมส่วนลด: <b>{money(preview.grandDiscount)} บาท</b>
            </div>
            <div>
              รวม Net: <b>{money(preview.grandNet)} บาท</b>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <a
          href={`/orders/${order.id}/print`}
          className="text-sm text-gray-700 hover:text-gray-900 border rounded px-4 py-2"
        >
          พิมพ์ Sales Order (เอกสารภายใน)
        </a>
        {isDraft && (
          <ActionButton
            action={confirmAction}
            label="✓ Confirm ออเดอร์ (สร้างบิลแยกตามกลุ่มส่วนลด)"
            pendingLabel="กำลัง Confirm..."
            successMessage="Confirm ออเดอร์สำเร็จ — สร้าง Invoice เรียบร้อย"
            disabled={order.items.length === 0}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded px-4 py-2"
          />
        )}
        {order.status !== "CANCELLED" && (
          <CancelButton
            action={cancelAction}
            confirmMessage="ยืนยันยกเลิกออเดอร์นี้?"
            label="ยกเลิกออเดอร์"
            successMessage="ยกเลิกออเดอร์สำเร็จ"
          />
        )}
        {editGuard?.kind === "editable" && (
          <OrderEditModal
            orderNumber={order.orderNumber}
            initialItems={initialEditItems}
            requiresPrintedAck={editGuard.requiresPrintedAck}
            activeInvoiceCount={activeInvoiceCount}
            initialApplyDiscount={order.applyDiscount}
            action={editAction}
            suggestPriceAction={suggestPriceAction}
            canManageProducts={canManageProducts}
          />
        )}
      </div>

      {editGuard?.kind === "locked" && (
        <p className="text-xs text-gray-500 mt-2">
          Order นี้แก้ไขไม่ได้แล้ว เนื่องจากมี{editGuard.reasons.map((r) => LOCKED_REASON_LABEL[r]).join("และ")}
          อ้างอิงอยู่ — ใช้ &quot;คัดลอกออเดอร์นี้เป็นออเดอร์ใหม่&quot; ด้านล่างแทน
        </p>
      )}
      {editGuard?.kind === "no-active-invoices" && (
        <p className="text-xs text-red-600 mt-2">
          Order นี้ไม่มี Invoice ที่ Active เหลืออยู่เลย (สถานะผิดปกติ) — กรุณาติดต่อผู้ดูแลระบบ/เจ้าของระบบ
        </p>
      )}

      {/* Owner UAT Fix — เลือกหลายใบแล้วพิมพ์เรียงคิวจาก Order ได้เลย (Back กลับหน้านี้
          เสมอ) — Reuse Print Flow/markInvoicePrinted เดิมทุกใบ ดู order-invoice-print-panel */}
      {order.invoices.length > 0 && (
        <OrderInvoicePrintPanel
          orderId={order.id}
          invoices={order.invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            typeLabel: displayProductTypeCode(inv.productTypeCode),
            amountLabel: money(inv.grandTotal),
            status: inv.status,
            printedAtLabel: inv.printedAt ? inv.printedAt.toLocaleDateString("th-TH") : null,
          }))}
        />
      )}
      <div className="bg-white border rounded-lg p-3 mt-4 flex items-center gap-2">
        <span className="text-sm text-gray-600">คัดลอกออเดอร์นี้เป็นออเดอร์ใหม่ (ราคา/ส่วนลดจะคำนวณใหม่ตามวันที่ที่เลือก):</span>
        <ActionForm action={duplicateOrder.bind(null, order.id)} className="flex gap-2 items-end">
          <Field label="" name="newOrderDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          <SubmitButton pendingLabel="กำลังคัดลอก..." className="text-sm bg-gray-800 hover:bg-gray-900 text-white rounded px-3 py-1">
            คัดลอก
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
