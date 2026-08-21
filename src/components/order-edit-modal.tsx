"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

type ProductResult = { id: string; sku: string; name: string; unit: string; productTypeName: string };
type EditItem = {
  key: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  productTypeName: string;
  quantity: number;
  descriptionOverride: string;
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
  action,
}: {
  orderNumber: string;
  initialItems: EditItem[];
  requiresPrintedAck: boolean;
  activeInvoiceCount: number;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<EditItem[]>(initialItems);
  const [acknowledgePrinted, setAcknowledgePrinted] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [qty, setQty] = useState("1");
  const [selected, setSelected] = useState<ProductResult | null>(null);

  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;
    setItems(initialItems);
    setAcknowledgePrinted(false);
    setQuery("");
    setResults([]);
    setSelected(null);
    setQty("1");
  }, [isOpen, initialItems]);

  useEffect(() => {
    if (!query || selected) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
        setResults(await res.json());
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, selected]);

  function addItem() {
    if (!selected) return;
    const quantity = Number(qty);
    if (!(quantity > 0)) return;
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
      },
    ]);
    setSelected(null);
    setQuery("");
    setQty("1");
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
      JSON.stringify(items.map((i) => ({ productId: i.productId, quantity: i.quantity, descriptionOverride: i.descriptionOverride || undefined })))
    );
    formData.set("acknowledgePrinted", acknowledgePrinted ? "1" : "0");
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
                      <th className="px-3 py-2 font-medium">SKU</th>
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

              <div className="flex gap-2 items-end bg-gray-50 border rounded-lg p-3 relative">
                <div className="flex-1 relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">ค้นหาสินค้า (SKU หรือชื่อ)</label>
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSelected(null);
                    }}
                    placeholder="เช่น M001 หรือ ที่นอนสปริง"
                    autoComplete="off"
                    className="w-full border rounded px-3 py-1.5 text-sm"
                  />
                  {results.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white border rounded mt-1 shadow-lg max-h-48 overflow-auto">
                      {results.map((p) => (
                        <li
                          key={p.id}
                          onMouseDown={() => {
                            setSelected(p);
                            setQuery(`${p.sku} — ${p.name}`);
                            setResults([]);
                          }}
                          className="px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50"
                        >
                          <span className="font-mono">{p.sku}</span> — {p.name}
                          <span className="text-gray-400 ml-2 text-xs">({p.productTypeName})</span>
                        </li>
                      ))}
                    </ul>
                  )}
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
                  disabled={!selected}
                  onClick={addItem}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 h-[34px]"
                >
                  + เพิ่ม
                </button>
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
