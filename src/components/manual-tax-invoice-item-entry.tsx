"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { ProductSearchPicker, type PickedProduct, type UnresolvedSizeInfo } from "@/components/product-search-picker";
import { getSuggestedTaxInvoiceItem } from "@/app/(dashboard)/tax-invoices/actions";
import { useToast } from "@/components/toast/toast-provider";

type ManualItem = { description: string; size: string; quantity: number; unit: string; unitPrice: number };

// Phase E-UX — เชื่อม Product/Model/Size/Pricing เข้ากับหน้า Manual Tax Invoice ตาม
// หลักเดียวกับ Create Document (Order/Quotation): ค้นหา Product/Model จริงผ่าน
// ProductSearchPicker เดิมของ R4 ทุกประการ (ไม่มี Picker/Size Architecture ชุดใหม่)
// แล้วให้ Server Action (getSuggestedTaxInvoiceItem) Autofill รายการ/ขนาด/หน่วย/ราคา
// จาก Product Master + Pricing Engine เดิม (getEffectivePrice) — TaxInvoiceItem ไม่มี
// productId ผูกจริง (ตรวจ Schema แล้ว เป็น Free-text Snapshot ล้วนๆ ตามเจตนาเดิมที่ให้
// ยืดหยุ่นได้เมื่อลูกค้าต่อรองยอด) ทุก Field ที่ Autofill มายังแก้ไขเองต่อได้เสมอ ไม่ Lock
export function ManualTaxInvoiceItemEntry({ createAction }: { createAction: (formData: FormData) => void }) {
  const [items, setItems] = useState<ManualItem[]>([]);
  const [draft, setDraft] = useState<ManualItem>({ description: "", size: "", quantity: 1, unit: "หลัง", unitPrice: 0 });
  const [err, setErr] = useState("");
  const [pickerResetToken, setPickerResetToken] = useState(0);
  const { showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);

  if (thrownError) throw thrownError;

  function handleClear() {
    setDraft((prev) => ({ ...prev, description: "", size: "", unitPrice: 0 }));
  }

  // customerId/branchId/taxInvoiceDate อยู่นอก Component นี้ (Field ของ Parent Server
  // Component เชื่อมกันผ่าน form="taxInvoiceForm" เดิม ไม่ใช่ React State ร่วมกัน) —
  // อ่านค่าปัจจุบันจาก DOM ตรงๆ ตอนเลือกสินค้า สอดคล้องกับ Pattern Vanilla Script ที่
  // หน้านี้ใช้อยู่แล้วสำหรับ Customer→Branch Cascade (ไม่ใช่ Pattern ใหม่)
  function handlePick(p: PickedProduct) {
    const customerId = (document.getElementById("customerSelect") as HTMLSelectElement | null)?.value || undefined;
    const branchId = (document.getElementById("branchSelect") as HTMLSelectElement | null)?.value || undefined;
    const taxInvoiceDate =
      (document.querySelector('input[name="taxInvoiceDate"]') as HTMLInputElement | null)?.value || undefined;

    startTransition(async () => {
      try {
        const suggested = await getSuggestedTaxInvoiceItem({ productId: p.id, customerId, branchId, taxInvoiceDate });
        setDraft((prev) => ({
          ...prev,
          description: suggested.description,
          size: suggested.size,
          unit: suggested.unit,
          unitPrice: suggested.unitPrice,
        }));
        setErr("");
      } catch (err) {
        unstable_rethrow(err);
        showError("ดึงราคาแนะนำไม่สำเร็จ — กรอกรายการ/ราคาเองได้ตามปกติ");
      }
    });
  }

  // R6 Phase B — เลือก Size ที่ยังไม่มี Product จริงรองรับ (Standard ที่ยังไม่ตั้งราคา
  // หรือ "ขนาดพิเศษ/ระบุเอง") — TaxInvoiceItem ไม่มี productId ผูกอยู่แล้ว (Free-text
  // Snapshot ตามเดิม) จึงไม่ต้องบล็อกเหมือน Order/Quotation แค่เติมชื่อ/ขนาดให้ ราคาต้อง
  // กรอกเอง (ห้ามระบบเดาราคาตามที่อนุมัติ)
  function handleUnresolvedSize(info: UnresolvedSizeInfo | null) {
    if (!info) return;
    setDraft((prev) => ({
      ...prev,
      description: info.modelName,
      size: info.custom ? "" : info.size,
      unit: info.unit || prev.unit,
      unitPrice: 0,
    }));
    if (!info.custom) {
      showError("ไซส์นี้ยังไม่มีในระบบ — กรอกราคาเอง");
    }
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
    setDraft({ description: "", size: "", quantity: 1, unit: "หลัง", unitPrice: 0 });
    setPickerResetToken((t) => t + 1);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <div>
      <div className="bg-white border rounded-lg p-3 mb-3">
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-5">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              สินค้า/รุ่น — ค้นหาแล้วเลือกขนาด (ถ้ามี) เพื่อดึงรายการ/ราคาอัตโนมัติ
            </label>
            <ProductSearchPicker
              onPick={handlePick}
              onUnresolvedSize={handleUnresolvedSize}
              onClear={handleClear}
              placeholder="ค้นหาสินค้า/รุ่น..."
              resetToken={pickerResetToken}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">รายการ</label>
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="เช่น ที่นอนสปริง GT-David"
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">ขนาด</label>
            <input
              value={draft.size}
              onChange={(e) => setDraft({ ...draft, size: e.target.value })}
              placeholder="เช่น 5 ฟุต"
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
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
          <div className="col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">หน่วย</label>
            <input
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">ราคา/หน่วย</label>
            <input
              type="number"
              step="0.01"
              value={draft.unitPrice}
              onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) })}
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-1">
            <button
              type="button"
              onClick={addItem}
              disabled={isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-2 py-1.5"
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
              <th className="px-4 py-2 font-medium text-right">ราคา/หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
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
                <td className="px-4 py-2 text-right">{item.unitPrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-right">
                  {(item.quantity * item.unitPrice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => removeItem(idx)} className="text-xs text-gray-500 hover:text-red-600">
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  ยังไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t font-medium">
                <td colSpan={5} className="px-4 py-2 text-right">
                  รวม (VAT-inclusive)
                </td>
                <td className="px-4 py-2 text-right">{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <form action={createAction} id="taxInvoiceForm">
        <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />
        <button
          type="submit"
          disabled={items.length === 0}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2"
        >
          ✓ สร้างใบกำกับภาษี
        </button>
      </form>
    </div>
  );
}
