import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import {
  addQuotationItem,
  removeQuotationItem,
  updateQuotationVatMode,
  confirmQuotation,
  cancelQuotation,
  editConfirmedQuotation,
} from "../actions";
import { computeQuotationCalc, type QuotationVatModeValue } from "@/lib/quotation-pricing";
import { OrderItemEntryForm } from "@/components/order-item-entry-form";
import { QuotationEditModal } from "@/components/quotation-edit-modal";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CancelButton } from "@/components/cancel-button";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { SelectField } from "@/components/form/fields";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function QuotationDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!can(role, "quotation.view")) redirect("/");

  const quotation = await db.quotation.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      branch: true,
      items: { include: { product: { include: { productType: true } } } },
    },
  });
  if (!quotation) notFound();

  const isDraft = quotation.status === "DRAFT";
  const isConfirmed = quotation.status === "CONFIRMED";
  const status = STATUS_LABEL[quotation.status];

  const addItemAction = addQuotationItem.bind(null, quotation.id);
  const updateVatModeAction = updateQuotationVatMode.bind(null, quotation.id);
  const confirmAction = confirmQuotation.bind(null, quotation.id);
  const cancelAction = cancelQuotation.bind(null, quotation.id);
  const editAction = editConfirmedQuotation.bind(null, quotation.id);

  // DRAFT — Preview สดผ่าน Pricing Engine เดิม (ยังไม่ Persist), CONFIRMED/CANCELLED —
  // อ่านจาก Snapshot fields เท่านั้น ห้ามคำนวณสดอีก (Document Snapshot Principle)
  const preview =
    isDraft && quotation.items.length > 0
      ? await computeQuotationCalc(
          quotation.items.map((i) => ({ productId: i.productId, quantity: i.quantity, descriptionOverride: i.descriptionOverride })),
          { customerId: quotation.customerId, branchId: quotation.branchId, quotationDate: quotation.quotationDate, vatMode: quotation.vatMode as QuotationVatModeValue }
        )
      : null;

  const initialEditItems = quotation.items.map((item) => ({
    key: item.id,
    productId: item.productId,
    sku: item.product.sku,
    name: item.descriptionOverride || item.product.name,
    unit: item.product.unit,
    productTypeName: item.product.productType.name,
    quantity: Number(item.quantity),
    descriptionOverride: item.descriptionOverride ?? "",
  }));

  return (
    <div className="max-w-4xl">
      <a href="/quotations" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบเสนอราคา
      </a>

      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold font-mono">
          {quotation.quotationNumber}
          {quotation.revisionNo > 0 && <span className="text-sm text-gray-400 ml-2">Rev.{quotation.revisionNo}</span>}
        </h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {quotation.customer.companyName} / {quotation.branch.name} · {quotation.quotationDate.toLocaleDateString("th-TH")}
        {quotation.reference && <> · อ้างอิง: {quotation.reference}</>}
      </p>

      {isDraft && (
        <>
          <div className="bg-white border rounded-lg p-4 mb-4 flex items-end gap-3">
            <ActionForm action={updateVatModeAction} successMessage="เปลี่ยน VAT สำเร็จ" className="flex items-end gap-2">
              <SelectField label="VAT" name="vatMode" defaultValue={quotation.vatMode}>
                <option value="NONE">ไม่คิด VAT</option>
                <option value="STANDARD">คิด VAT (อัตรามาตรฐาน)</option>
              </SelectField>
              <SubmitButton pendingLabel="กำลังเปลี่ยน..." className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50 bg-white text-gray-900">
                เปลี่ยน VAT
              </SubmitButton>
            </ActionForm>
          </div>
          <div className="mb-4">
            <OrderItemEntryForm key={quotation.items.length} addAction={addItemAction} />
          </div>
        </>
      )}

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">รายการ</th>
              <th className="px-4 py-2 font-medium">ประเภท</th>
              <th className="px-4 py-2 font-medium text-right">จำนวน</th>
              <th className="px-4 py-2 font-medium">หน่วย</th>
              {isDraft && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2 font-mono">{item.product.sku}</td>
                <td className="px-4 py-2">{item.descriptionOverride || item.product.name}</td>
                <td className="px-4 py-2">{item.product.productType.name}</td>
                <td className="px-4 py-2 text-right">{Number(item.quantity)}</td>
                <td className="px-4 py-2">{item.product.unit}</td>
                {isDraft && (
                  <td className="px-4 py-2 text-right">
                    <ActionButton
                      action={removeQuotationItem.bind(null, quotation.id, item.id)}
                      label="ลบ"
                      pendingLabel="กำลังลบ..."
                      successMessage="ลบรายการสำเร็จ"
                      className="text-xs text-gray-500 hover:text-red-600 border-0 p-0"
                    />
                  </td>
                )}
              </tr>
            ))}
            {quotation.items.length === 0 && (
              <tr>
                <td colSpan={isDraft ? 6 : 5} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีรายการสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(preview || isConfirmed || quotation.status === "CANCELLED") && quotation.items.length > 0 && (
        <div className="bg-white border rounded-lg p-4 mb-4 text-sm ml-auto max-w-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">รวม (จำนวนเงิน)</span>
            <span>{money(preview ? preview.grossAmount : quotation.grossAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">ส่วนลด</span>
            <span>{money(preview ? preview.discountAmount : quotation.discountAmount)}</span>
          </div>
          {(preview ? preview.vatAmount.toNumber() > 0 : Number(quotation.vatAmount) > 0) && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">มูลค่าก่อน VAT</span>
                <span>{money(preview ? preview.netBeforeVat : quotation.netBeforeVat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">VAT ({Number(preview ? preview.vatRateSnapshot : quotation.vatRateSnapshot)}%)</span>
                <span>{money(preview ? preview.vatAmount : quotation.vatAmount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between font-medium border-t pt-1">
            <span>ยอดรวม</span>
            <span>{money(preview ? preview.grandTotal : quotation.grandTotal)} บาท</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {isConfirmed && (
          <a
            href={`/quotations/${quotation.id}/print`}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
          >
            พิมพ์เอกสาร
          </a>
        )}
        {isDraft && (
          <ActionButton
            action={confirmAction}
            label="✓ Confirm ใบเสนอราคา"
            pendingLabel="กำลัง Confirm..."
            successMessage="Confirm ใบเสนอราคาสำเร็จ"
            disabled={quotation.items.length === 0}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded px-4 py-2"
          />
        )}
        {quotation.status !== "CANCELLED" && (
          <CancelButton
            action={cancelAction}
            confirmMessage="ยืนยันยกเลิกใบเสนอราคานี้?"
            label="ยกเลิกใบเสนอราคา"
            successMessage="ยกเลิกใบเสนอราคาสำเร็จ"
          />
        )}
        {isConfirmed && (
          <QuotationEditModal
            quotationNumber={quotation.quotationNumber}
            initialItems={initialEditItems}
            initialVatMode={quotation.vatMode}
            action={editAction}
          />
        )}
      </div>
    </div>
  );
}
