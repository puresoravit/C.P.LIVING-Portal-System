"use client";

import { useState, useEffect, useTransition } from "react";
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

// แก้ไข Quotation ที่ CONFIRMED แล้ว — Re-snapshot ใบเดิม (เลขที่เดิม, revisionNo+1)
// ต่างจาก OrderEditModal (E3) ตรงที่ไม่มี Downstream Chain ต้อง Cancel/สร้างใหม่ —
// ส่งรายการ+VAT Mode ทั้งชุดไปคำนวณ/Snapshot ใหม่ในครั้งเดียว
export function QuotationEditModal({
  quotationNumber,
  initialItems,
  initialVatMode,
  initialApplyDiscount,
  action,
}: {
  quotationNumber: string;
  initialItems: EditItem[];
  initialVatMode: string;
  initialApplyDiscount: boolean;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<EditItem[]>(initialItems);
  const [vatMode, setVatMode] = useState(initialVatMode);
  // R3 — เปลี่ยนการใช้ส่วนลดได้ตอน Revision เช่นเดียวกับ VAT Mode ที่เปลี่ยนได้อยู่แล้ว
  const [applyDiscount, setApplyDiscount] = useState(initialApplyDiscount);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [qty, setQty] = useState("1");
  const [selected, setSelected] = useState<ProductResult | null>(null);

  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;
    setItems(initialItems);
    setVatMode(initialVatMode);
    setApplyDiscount(initialApplyDiscount);
    setQuery("");
    setResults([]);
    setSelected(null);
    setQty("1");
  }, [isOpen, initialItems, initialVatMode, initialApplyDiscount]);

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

  const canSubmit = items.length > 0 && !isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    const formData = new FormData();
    formData.set(
      "itemsJson",
      JSON.stringify(items.map((i) => ({ productId: i.productId, quantity: i.quantity, descriptionOverride: i.descriptionOverride || undefined })))
    );
    formData.set("vatMode", vatMode);
    formData.set("applyDiscount", applyDiscount ? "1" : "0");
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        showSuccess("แก้ไขใบเสนอราคาสำเร็จ (Revision ใหม่)");
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
        แก้ไขใบเสนอราคา
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">แก้ไขใบเสนอราคา {quotationNumber}</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
                ×
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                การบันทึกจะสร้าง <b>Revision ใหม่</b> ของใบเสนอราคาใบนี้ (เลขที่เดิม, Rev. เพิ่มขึ้น 1) — ราคา/ส่วนลด/VAT
                จะถูกคำนวณใหม่ทั้งหมดตามรายการที่แก้ไข
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">VAT ในเอกสาร</label>
                  <select value={vatMode} onChange={(e) => setVatMode(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
                    <option value="NONE">ไม่แยกแสดง VAT</option>
                    <option value="STANDARD">แยกแสดง VAT (ราคาที่ตั้งไว้รวม VAT อยู่แล้ว — ยอดรวมไม่เปลี่ยน)</option>
                  </select>
                </div>
                <label className="flex items-center gap-1.5 text-sm pb-2">
                  <input type="checkbox" checked={applyDiscount} onChange={(e) => setApplyDiscount(e.target.checked)} />
                  ใช้ส่วนลด (ตามเงื่อนไขลูกค้า/สาขาที่ตั้งไว้)
                </label>
              </div>

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
                {isPending ? "กำลังบันทึก..." : "บันทึก (สร้าง Revision ใหม่)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
