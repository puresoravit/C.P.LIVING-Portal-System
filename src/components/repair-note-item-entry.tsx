"use client";

import { useState } from "react";
import { ProductSearchPicker, type PickedProduct, type UnresolvedSizeInfo, type ModelResult } from "@/components/product-search-picker";
import { ModelSizeSelect, type ModelSizeResolution } from "@/components/model-size-select";

type Item = { description: string; size: string; quantity: number; unit: string };

// Owner UAT Fix Batch 1 — ข้อ 5: เชื่อม Product Master เข้ากับเอกสารนี้ตาม Pattern
// เดียวกับเอกสารอื่น (สินค้า/รุ่น | ขนาด | จำนวน | หน่วย | รายละเอียด) — ProductSearchPicker
// เป็นแค่ Autofill Helper (Client-side ล้วนๆ) ไม่มี Server Action ใหม่ เพราะเอกสารนี้
// ไม่มีราคาต้องคำนวณ — RepairReturnNoteItem ยังไม่ผูก FK กับ Product Master เหมือนเดิม
// ทุกประการ (Free-text Snapshot) ทุก Field ที่ Autofill มายังแก้ไขเองต่อได้เสมอ
export function RepairNoteItemEntry({ createAction }: { createAction: (formData: FormData) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Item>({ description: "", size: "", quantity: 1, unit: "หลัง" });
  const [err, setErr] = useState("");
  const [pickerResetToken, setPickerResetToken] = useState(0);
  // Owner UAT Round 3 — ข้อ 4: เหมือน Tax Invoice ทุกประการ
  const [selectedModel, setSelectedModel] = useState<ModelResult | null>(null);

  function handlePick(p: PickedProduct) {
    setDraft((prev) => ({ ...prev, description: p.modelName ?? p.name, size: p.size ?? "" }));
  }

  function handleUnresolvedSize(info: UnresolvedSizeInfo | null) {
    if (!info) return;
    setDraft((prev) => ({ ...prev, description: info.modelName, size: info.custom ? "" : info.size }));
  }

  function handleSizeResolve(result: ModelSizeResolution) {
    if (!result) return;
    if ("picked" in result) handlePick(result.picked);
    else handleUnresolvedSize(result.unresolved);
  }

  function handleClear() {
    setDraft((prev) => ({ ...prev, description: "", size: "" }));
    setSelectedModel(null);
  }

  function addItem() {
    if (!draft.description.trim()) {
      setErr("กรอกรายการก่อน");
      return;
    }
    if (draft.quantity <= 0) {
      setErr("จำนวนต้องมากกว่า 0");
      return;
    }
    setErr("");
    setItems((prev) => [...prev, draft]);
    setDraft({ description: "", size: "", quantity: 1, unit: "หลัง" });
    setPickerResetToken((t) => t + 1);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="bg-white border rounded-lg p-3 mb-3">
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              สินค้า/รุ่น — ค้นหาแล้วเลือกขนาด (ถ้ามี) เพื่อดึงรายการอัตโนมัติ
            </label>
            <ProductSearchPicker
              onPick={handlePick}
              onUnresolvedSize={handleUnresolvedSize}
              onModelSelected={setSelectedModel}
              onClear={handleClear}
              placeholder="ค้นหาสินค้า/รุ่น..."
              resetToken={pickerResetToken}
            />
          </div>
          <div className="col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">รายการ</label>
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="เช่น ที่นอนสปริง Mary (PVC สีโอวัลติน)"
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">ขนาด</label>
            {selectedModel ? (
              <ModelSizeSelect model={selectedModel} onResolve={handleSizeResolve} />
            ) : (
              <input
                value={draft.size}
                onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                placeholder="เช่น 5 ฟุต"
                className="w-full border rounded px-3 py-1.5 text-sm"
              />
            )}
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">จำนวน</label>
            <input
              type="number"
              step="0.01"
              value={draft.quantity}
              onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })}
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">หน่วย</label>
            <input
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-1">
            <button
              type="button"
              onClick={addItem}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-2 py-1.5"
            >
              เพิ่ม
            </button>
          </div>
        </div>
        {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      </div>

      <div className="bg-white border rounded-lg overflow-hidden mb-3">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รายการ</th>
              <th className="px-4 py-2 font-medium">ขนาด</th>
              <th className="px-4 py-2 font-medium text-right">จำนวน</th>
              <th className="px-4 py-2 font-medium">หน่วย</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-4 py-2">{item.description}</td>
                <td className="px-4 py-2">{item.size}</td>
                <td className="px-4 py-2 text-right">{item.quantity}</td>
                <td className="px-4 py-2">{item.unit}</td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => removeItem(idx)} className="text-xs text-gray-500 hover:text-red-600">
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  ยังไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={createAction} id="repairNoteForm">
        <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />
        <button
          type="submit"
          disabled={items.length === 0}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2"
        >
          ✓ สร้างใบส่งคืนสินค้าฝากซ่อม
        </button>
      </form>
    </div>
  );
}
