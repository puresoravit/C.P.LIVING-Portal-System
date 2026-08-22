"use client";

import { useState, useEffect, useTransition } from "react";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { ProductSearchPicker, type PickedProduct, type UnresolvedSizeInfo } from "@/components/product-search-picker";
import { SizeOverrideFields } from "@/components/size-override-fields";

type EditItem = {
  key: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  productTypeName: string;
  quantity: number;
  descriptionOverride: string;
  // R6 Phase B — ขนาดพิเศษ/ระบุเอง ("" = Standard Size ปกติ ไม่ Override อะไรเลย)
  sizeOverride: string;
  unitPriceOverride: number | null;
};

// E3 — Proper Modal สำหรับแก้ไข Order ที่ Confirmed แล้ว (Case A) แทน window.confirm()
// รายการที่แก้ไขเป็น local state ล้วนๆ จนกว่าจะกด "บันทึกการแก้ไข" — ส่งทั้งชุดไปที่
// editConfirmedOrder ในครั้งเดียว (เหมือน itemsJson pattern ที่ createManualTaxInvoice/
// createRepairReturnNote ใช้อยู่แล้ว) ไม่ mutate DB ทีละรายการเหมือนหน้า Draft
export function OrderEditModal({
  orderNumber,
  initialItems,
  requiresPrintedAck,
  activeInvoiceCount,
  initialApplyDiscount,
  action,
  canManageProducts = false,
}: {
  orderNumber: string;
  initialItems: EditItem[];
  requiresPrintedAck: boolean;
  activeInvoiceCount: number;
  initialApplyDiscount: boolean;
  action: (formData: FormData) => Promise<ActionResult>;
  canManageProducts?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<EditItem[]>(initialItems);
  const [acknowledgePrinted, setAcknowledgePrinted] = useState(false);
  // R3 — เปลี่ยนการใช้ส่วนลดได้ระหว่างแก้ไข Order ที่ Confirmed แล้ว (true→false หรือ
  // false→true) — Invoice เดิมถูก Cancel + Invoice ใหม่คำนวณตามค่านี้เสมอ (ไม่แตะ History เดิม)
  const [applyDiscount, setApplyDiscount] = useState(initialApplyDiscount);

  const [qty, setQty] = useState("1");
  const [selected, setSelected] = useState<PickedProduct | null>(null);
  // R6 Phase B — เหมือน OrderItemEntryForm ทุกประการ
  const [unresolvedInfo, setUnresolvedInfo] = useState<UnresolvedSizeInfo | null>(null);
  const [overrideSize, setOverrideSize] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  // R4 — ตัว Modal นี้ไม่ remount ProductSearchPicker ระหว่างเพิ่มรายการหลายรายการ
  // (ต่างจากหน้า Draft ที่ remount ด้วย key) จึงต้องสั่งล้าง Search ภายในเองผ่าน resetToken
  const [pickerResetToken, setPickerResetToken] = useState(0);

  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;
    setItems(initialItems);
    setAcknowledgePrinted(false);
    setApplyDiscount(initialApplyDiscount);
    setSelected(null);
    setUnresolvedInfo(null);
    setOverrideSize("");
    setOverridePrice("");
    setQty("1");
    setPickerResetToken((t) => t + 1);
  }, [isOpen, initialItems, initialApplyDiscount]);

  function handleUnresolvedSize(info: UnresolvedSizeInfo | null) {
    setSelected(null);
    setUnresolvedInfo(info);
    setOverrideSize(info && !info.custom ? info.size : "");
    setOverridePrice("");
  }

  const overrideReady = !!unresolvedInfo?.anchorProductId && overrideSize.trim() !== "" && Number(overridePrice) > 0;

  function addItem() {
    const quantity = Number(qty);
    if (!(quantity > 0)) return;
    if (selected) {
      setItems((prev) => [
        ...prev,
        {
          key: `${selected.id}-${Date.now()}`,
          productId: selected.id,
          sku: selected.sku,
          name: selected.name,
          unit: selected.unit,
          productTypeName: selected.productTypeName,
          quantity,
          descriptionOverride: "",
          sizeOverride: "",
          unitPriceOverride: null,
        },
      ]);
    } else if (overrideReady && unresolvedInfo) {
      setItems((prev) => [
        ...prev,
        {
          key: `${unresolvedInfo.anchorProductId}-${Date.now()}`,
          productId: unresolvedInfo.anchorProductId!,
          sku: "-",
          name: `${unresolvedInfo.modelName} ${overrideSize.trim()}`.trim(),
          unit: unresolvedInfo.unit,
          productTypeName: unresolvedInfo.productTypeName,
          quantity,
          descriptionOverride: "",
          sizeOverride: overrideSize.trim(),
          unitPriceOverride: Number(overridePrice),
        },
      ]);
    } else {
      return;
    }
    setSelected(null);
    setUnresolvedInfo(null);
    setOverrideSize("");
    setOverridePrice("");
    setQty("1");
    setPickerResetToken((t) => t + 1);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  const canSubmit = items.length > 0 && (!requiresPrintedAck || acknowledgePrinted) && !isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    const formData = new FormData();
    formData.set(
      "itemsJson",
      JSON.stringify(
        items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          // R6 Phase B — รายการ Override (มี sizeOverride) ต้อง Default ชื่อที่แสดงเป็น
          // "ชื่อรุ่น + ขนาดที่พิมพ์" เสมอ ไม่งั้นจะไปโชว์ชื่อ Anchor Product ผิดๆ แทน —
          // รายการ Standard ปกติยังปล่อย undefined ให้ Fallback ไปที่ Product.name สดๆ
          // จาก DB เหมือนเดิมทุกประการ (ไม่ Freeze ชื่อ ณ ตอนเลือกเหมือนรายการ Override)
          descriptionOverride: i.descriptionOverride || (i.sizeOverride ? i.name : undefined),
          sizeOverride: i.sizeOverride || undefined,
          unitPriceOverride: i.unitPriceOverride ?? undefined,
        }))
      )
    );
    formData.set("acknowledgePrinted", acknowledgePrinted ? "1" : "0");
    formData.set("applyDiscount", applyDiscount ? "1" : "0");
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        showSuccess("แก้ไข Order สำเร็จ — สร้าง Invoice ใหม่เรียบร้อย");
        setIsOpen(false);
      } else {
        showError(result.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm text-gray-700 hover:text-blue-600 border rounded px-4 py-2"
      >
        แก้ไข Order
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">แก้ไข Order {orderNumber}</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
                ×
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                การบันทึกการแก้ไขนี้จะ<b>ยกเลิก Invoice เดิม {activeInvoiceCount} ใบ</b>
                ของ Order นี้ (เลขที่เอกสารเดิมจะคงอยู่เป็นสถานะยกเลิกถาวร ไม่ลบ ไม่นำกลับมาใช้ซ้ำ) แล้วสร้าง Invoice
                ใหม่ด้วยเลขที่เอกสารใหม่หลังบันทึกสำเร็จ
              </div>

              <label className="flex items-center gap-2 text-sm bg-gray-50 border rounded-lg p-3">
                <input type="checkbox" checked={applyDiscount} onChange={(e) => setApplyDiscount(e.target.checked)} />
                ใช้ส่วนลด (ตามเงื่อนไขลูกค้า/สาขาที่ตั้งไว้)
              </label>

              {requiresPrintedAck && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-2">
                  <div>
                    <b>คำเตือน:</b> เอกสาร Invoice บางใบของ Order นี้ถูก<b>พิมพ์ไปแล้ว</b> —
                    การแก้ไขจะทำให้เอกสารที่พิมพ์ไปแล้วกลายเป็นโมฆะ (ถูกยกเลิก) ทันที
                  </div>
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={acknowledgePrinted}
                      onChange={(e) => setAcknowledgePrinted(e.target.checked)}
                    />
                    ฉันรับทราบว่าเอกสารที่เคยพิมพ์แล้วจะถูกยกเลิก
                  </label>
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">รหัสสินค้า</th>
                      <th className="px-3 py-2 font-medium">รายการ</th>
                      <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                      <th className="px-3 py-2 font-medium">หน่วย</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.key} className="border-t">
                        <td className="px-3 py-2 font-mono">{item.sku}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2">{item.unit}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeItem(item.key)} className="text-xs text-gray-500 hover:text-red-600">
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                          ยังไม่มีรายการสินค้า
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-gray-50 border rounded-lg p-3 relative space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      ค้นหารุ่นสินค้า/สินค้า (ชื่อรุ่น, รหัสสินค้า หรือชื่อ)
                    </label>
                    <ProductSearchPicker
                      onPick={(p) => {
                        setSelected(p);
                        setUnresolvedInfo(null);
                      }}
                      onUnresolvedSize={handleUnresolvedSize}
                      onClear={() => {
                        setSelected(null);
                        setUnresolvedInfo(null);
                        setOverrideSize("");
                        setOverridePrice("");
                      }}
                      placeholder="เช่น M001 หรือ ที่นอนสปริง"
                      resetToken={pickerResetToken}
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-600 mb-1">จำนวน</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!selected && !overrideReady}
                    onClick={addItem}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 h-[34px]"
                  >
                    + เพิ่ม
                  </button>
                </div>
                {unresolvedInfo && (
                  <SizeOverrideFields
                    info={unresolvedInfo}
                    sizeText={overrideSize}
                    price={overridePrice}
                    onSizeTextChange={setOverrideSize}
                    onPriceChange={setOverridePrice}
                    canManageProducts={canManageProducts}
                  />
                )}
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => setIsOpen(false)} className="text-sm border rounded px-4 py-2 hover:bg-gray-50">
                ยกเลิก
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2"
              >
                {isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
