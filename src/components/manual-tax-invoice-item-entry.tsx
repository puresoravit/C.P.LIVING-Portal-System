"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { ProductSearchPicker, type PickedProduct, type UnresolvedSizeInfo, type ModelResult } from "@/components/product-search-picker";
import { ModelSizeSelect, type ModelSizeResolution } from "@/components/model-size-select";
import { getSuggestedTaxInvoiceItem, getSuggestedTaxInvoiceGroupDiscounts } from "@/app/(dashboard)/tax-invoices/actions";
import { useToast } from "@/components/toast/toast-provider";

// Phase H — productId เก็บไว้ฝั่ง Client เท่านั้น (ใช้หา Discount Group ตอนโหมด GROUP)
// ไม่ถูกส่งลง DB — TaxInvoiceItem ยังเป็น Free-text Snapshot ล้วนๆ ตามเจตนาเดิม
type ManualItem = {
  description: string;
  size: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountAmount: number;
  productId: string | null;
};

type DiscountMode = "NONE" | "GROUP" | "CUSTOM";

// ปัดเงิน 2 ตำแหน่ง Round Half Up ให้ตรง roundMoney ฝั่ง Server (ค่าที่นี่เป็น Preview/
// Prefill เท่านั้น — ตัวเลขจริงคำนวณซ้ำฝั่ง Server ใน computeManualTaxInvoiceTotals เสมอ)
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// Phase E-UX — เชื่อม Product/Model/Size/Pricing เข้ากับหน้า Manual Tax Invoice ตาม
// หลักเดียวกับ Create Document (Order/Quotation): ค้นหา Product/Model จริงผ่าน
// ProductSearchPicker เดิมของ R4 ทุกประการ (ไม่มี Picker/Size Architecture ชุดใหม่)
// แล้วให้ Server Action (getSuggestedTaxInvoiceItem) Autofill รายการ/ขนาด/หน่วย/ราคา
// จาก Product Master + Pricing Engine เดิม — ทุก Field ที่ Autofill ยังแก้ไขต่อได้ ไม่ Lock
//
// Phase H — Discount UX 3 โหมด: ไม่ใช้ส่วนลด / ส่วนลดตาม Customer-Discount Group
// (Autofill จาก getEffectiveDiscountPct เดิมผ่าน Server Action — Read-only Suggestion)
// / กำหนดส่วนลดเอง (กรอกต่อบรรทัด = "ลดเฉพาะรายการที่เลือก" หรือกรอกยอดรวมแล้วกด
// กระจายตามสัดส่วน = "ลดจากยอดรวมทั้งเอกสาร") + Preview Subtotal → Discount → After
// Discount → VAT → Net ก่อนยืนยัน — ยอดจริงคำนวณฝั่ง Server เสมอ
export function ManualTaxInvoiceItemEntry({
  createAction,
  vatPctToday,
}: {
  createAction: (formData: FormData) => void;
  /** อัตรา VAT ที่มีผลวันนี้จาก VAT configuration จริง (ส่งมาจาก Server Component —
   * ใช้แสดง Preview เท่านั้น ตอนสร้างจริง Server อ่านอัตราตามวันที่เอกสารอีกครั้ง) */
  vatPctToday: number;
}) {
  const [items, setItems] = useState<ManualItem[]>([]);
  const [draft, setDraft] = useState<ManualItem>({
    description: "",
    size: "",
    quantity: 1,
    unit: "หลัง",
    unitPrice: 0,
    discountAmount: 0,
    productId: null,
  });
  const [err, setErr] = useState("");
  const [pickerResetToken, setPickerResetToken] = useState(0);
  // Owner UAT Round 3 — ข้อ 4: Model ที่เลือกไว้ (รอเลือกขนาด) — ตอนมีค่านี้ ช่อง "ขนาด"
  // จะเปลี่ยนจาก Free-text เป็น <ModelSizeSelect> (Dropdown ขนาดจริงของ Model นั้น)
  const [selectedModel, setSelectedModel] = useState<ModelResult | null>(null);
  const [discountMode, setDiscountMode] = useState<DiscountMode>("NONE");
  const [wholeDocDiscount, setWholeDocDiscount] = useState(0);
  const { showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);

  if (thrownError) throw thrownError;

  function handleClear() {
    setDraft((prev) => ({ ...prev, description: "", size: "", unitPrice: 0, productId: null }));
    setSelectedModel(null);
  }

  function handleSizeResolve(result: ModelSizeResolution) {
    if (!result) return;
    if ("picked" in result) handlePick(result.picked);
    else handleUnresolvedSize(result.unresolved);
  }

  // customerId/branchId/taxInvoiceDate อยู่นอก Component นี้ (Field ของ Parent Server
  // Component เชื่อมกันผ่าน form="taxInvoiceForm" เดิม ไม่ใช่ React State ร่วมกัน) —
  // อ่านค่าปัจจุบันจาก DOM ตรงๆ สอดคล้องกับ Pattern Vanilla Script ที่หน้านี้ใช้อยู่แล้ว
  function readHeaderFields() {
    return {
      customerId: (document.getElementById("customerSelect") as HTMLSelectElement | null)?.value || undefined,
      branchId: (document.getElementById("branchSelect") as HTMLSelectElement | null)?.value || undefined,
      taxInvoiceDate:
        (document.querySelector('input[name="taxInvoiceDate"]') as HTMLInputElement | null)?.value || undefined,
    };
  }

  function handlePick(p: PickedProduct) {
    const { customerId, branchId, taxInvoiceDate } = readHeaderFields();

    startTransition(async () => {
      try {
        const suggested = await getSuggestedTaxInvoiceItem({ productId: p.id, customerId, branchId, taxInvoiceDate });
        setDraft((prev) => ({
          ...prev,
          description: suggested.description,
          size: suggested.size,
          unit: suggested.unit,
          unitPrice: suggested.unitPrice,
          productId: p.id,
        }));
        setErr("");
      } catch (err) {
        unstable_rethrow(err);
        showError("ดึงราคาแนะนำไม่สำเร็จ — กรอกรายการ/ราคาเองได้ตามปกติ");
      }
    });
  }

  // R6 Phase B — เลือก Size ที่ยังไม่มี Product จริงรองรับ (Standard ที่ยังไม่ตั้งราคา
  // หรือ "ขนาดพิเศษ/ระบุเอง") — ราคาต้องกรอกเอง (ห้ามระบบเดาราคาตามที่อนุมัติ)
  function handleUnresolvedSize(info: UnresolvedSizeInfo | null) {
    if (!info) return;
    // Owner UAT — ข้อ 4: ต้องล้าง selectedModel ด้วย ไม่งั้นช่อง "ขนาด" จะค้างเป็น
    // <ModelSizeSelect> ต่อ (ดูเหตุผลเต็มใน Commit เดิม)
    setSelectedModel(null);
    setDraft((prev) => ({
      ...prev,
      description: info.modelName,
      size: info.custom ? "" : info.size,
      unit: info.unit || prev.unit,
      unitPrice: 0,
      productId: null,
    }));
    if (!info.custom) {
      showError("ไซส์นี้ยังไม่มีในระบบ — กรอกราคาเอง");
    }
  }

  // Phase H — โหมด GROUP: ดึงส่วนลดตามเงื่อนไขลูกค้า (Discount Group) จาก Engine เดิม
  // ผ่าน Server Action แล้วเติมลงต่อบรรทัด — เรียกซ้ำได้เสมอ (Idempotent Suggestion)
  function refreshGroupDiscounts(itemsArg: ManualItem[]) {
    const { customerId, branchId, taxInvoiceDate } = readHeaderFields();
    if (!customerId) {
      showError("เลือกลูกค้าก่อน จึงจะดึงส่วนลดตามเงื่อนไขลูกค้าได้");
      setDiscountMode("NONE");
      return;
    }
    if (itemsArg.length === 0) return;
    startTransition(async () => {
      try {
        const { discountAmounts } = await getSuggestedTaxInvoiceGroupDiscounts({
          customerId,
          branchId,
          taxInvoiceDate,
          items: itemsArg.map((i) => ({ productId: i.productId, amount: round2(i.quantity * i.unitPrice) })),
        });
        setItems(itemsArg.map((i, idx) => ({ ...i, discountAmount: discountAmounts[idx] ?? 0 })));
      } catch (err) {
        unstable_rethrow(err);
        showError("ดึงส่วนลดตามเงื่อนไขลูกค้าไม่สำเร็จ — เลือก 'กำหนดส่วนลดเอง' เพื่อกรอกเองได้");
      }
    });
  }

  function changeDiscountMode(mode: DiscountMode) {
    setDiscountMode(mode);
    if (mode === "NONE") {
      setItems((prev) => prev.map((i) => ({ ...i, discountAmount: 0 })));
      setWholeDocDiscount(0);
    } else if (mode === "GROUP") {
      refreshGroupDiscounts(items);
    }
    // CUSTOM — คงค่าที่มีอยู่ ให้แก้ต่อบรรทัดได้เลย
  }

  // Phase H — "ลดจากยอดรวมทั้งเอกสาร": กระจายตามสัดส่วนยอดแต่ละบรรทัด บรรทัดสุดท้าย
  // ดูดเศษปัดทั้งหมด (เทคนิคเดียวกับ allocateProportionally ใน pricing.ts) — เป็นแค่
  // Prefill ให้แก้ต่อได้ ยอดจริงตรวจ/คำนวณซ้ำฝั่ง Server
  function distributeWholeDocDiscount() {
    const target = round2(wholeDocDiscount);
    const amounts = items.map((i) => round2(i.quantity * i.unitPrice));
    const gross = round2(amounts.reduce((s, a) => s + a, 0));
    if (target < 0 || items.length === 0) return;
    if (target > gross) {
      setErr("ส่วนลดรวมเกินยอดรวมของเอกสาร");
      return;
    }
    setErr("");
    const allocated = amounts.map((a) => (gross === 0 ? 0 : round2((a / gross) * target)));
    const drift = round2(target - allocated.reduce((s, a) => s + a, 0));
    if (allocated.length > 0) allocated[allocated.length - 1] = round2(allocated[allocated.length - 1] + drift);
    setItems((prev) => prev.map((i, idx) => ({ ...i, discountAmount: allocated[idx] ?? 0 })));
  }

  function setItemDiscount(idx: number, value: number) {
    setItems((prev) => prev.map((i, iIdx) => (iIdx === idx ? { ...i, discountAmount: value } : i)));
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
    const next = [...items, draft];
    setItems(next);
    setDraft({ description: "", size: "", quantity: 1, unit: "หลัง", unitPrice: 0, discountAmount: 0, productId: null });
    setPickerResetToken((t) => t + 1);
    // โหมด GROUP — รายการใหม่ต้องได้ส่วนลดตามเงื่อนไขด้วย (Refresh ทั้งชุดให้สอดคล้อง)
    if (discountMode === "GROUP") refreshGroupDiscounts(next);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // Preview ladder — ลำดับคำนวณเดียวกับ computeManualTaxInvoiceTotals ฝั่ง Server:
  // หักส่วนลดก่อน แล้วถอด VAT (สูตร extractVat เดิม: VAT = net × rate ÷ (100+rate))
  const showDiscountColumn = discountMode !== "NONE";
  const itemAmounts = items.map((i) => round2(i.quantity * i.unitPrice));
  const gross = round2(itemAmounts.reduce((s, a) => s + a, 0));
  const discountTotal = round2(items.reduce((s, i) => s + round2(i.discountAmount || 0), 0));
  const net = round2(gross - discountTotal);
  const vatAmount = round2((net * vatPctToday) / (100 + vatPctToday));
  const valueAmount = round2(net - vatAmount);
  const discountInvalid =
    discountTotal < 0 || net < 0 || items.some((i, idx) => i.discountAmount < 0 || round2(i.discountAmount) > itemAmounts[idx]);

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
              onModelSelected={setSelectedModel}
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
              step="1"
              min="1"
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

      {/* Phase H — เลือกโหมดส่วนลด */}
      <div className="bg-white border rounded-lg p-3 mb-3 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-medium text-gray-600">ส่วนลด:</span>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="discountModeChoice"
              checked={discountMode === "NONE"}
              onChange={() => changeDiscountMode("NONE")}
            />
            ไม่ใช้ส่วนลด
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="discountModeChoice"
              checked={discountMode === "GROUP"}
              onChange={() => changeDiscountMode("GROUP")}
            />
            ใช้ส่วนลดตามเงื่อนไขลูกค้า (Discount Group)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="discountModeChoice"
              checked={discountMode === "CUSTOM"}
              onChange={() => changeDiscountMode("CUSTOM")}
            />
            กำหนดส่วนลดเอง
          </label>
        </div>
        {discountMode === "GROUP" && (
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-gray-500">
              ดึงจากเงื่อนไขส่วนลดของลูกค้า/สาขาตามกลุ่มสินค้า (เฉพาะรายการที่เลือกจากฐานสินค้า —
              รายการที่พิมพ์เองไม่ทราบกลุ่มสินค้า ส่วนลดเป็น 0)
            </p>
            <button
              type="button"
              onClick={() => refreshGroupDiscounts(items)}
              disabled={isPending || items.length === 0}
              className="text-xs border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
            >
              ↻ ดึงส่วนลดใหม่
            </button>
          </div>
        )}
        {discountMode === "CUSTOM" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-500">
              กรอกส่วนลดในคอลัมน์ "ส่วนลด" ของแต่ละรายการ (เฉพาะรายการที่ต้องการ) หรือกรอกยอดรวมแล้วกระจายตามสัดส่วน:
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={wholeDocDiscount}
              onChange={(e) => setWholeDocDiscount(Number(e.target.value))}
              className="border rounded px-2 py-1 w-28 text-right"
            />
            <button
              type="button"
              onClick={distributeWholeDocDiscount}
              disabled={items.length === 0}
              className="border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
            >
              กระจายส่วนลดทั้งเอกสาร
            </button>
          </div>
        )}
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
              {showDiscountColumn && <th className="px-4 py-2 font-medium text-right">ส่วนลด</th>}
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
                <td className="px-4 py-2 text-right">{fmt(item.unitPrice)}</td>
                {showDiscountColumn && (
                  <td className="px-4 py-2 text-right">
                    {discountMode === "CUSTOM" ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.discountAmount}
                        onChange={(e) => setItemDiscount(idx, Number(e.target.value))}
                        className={`border rounded px-2 py-1 w-24 text-right text-sm ${
                          item.discountAmount < 0 || round2(item.discountAmount) > itemAmounts[idx] ? "border-red-500" : ""
                        }`}
                      />
                    ) : (
                      fmt(round2(item.discountAmount))
                    )}
                  </td>
                )}
                <td className="px-4 py-2 text-right">{fmt(itemAmounts[idx])}</td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => removeItem(idx)} className="text-xs text-gray-500 hover:text-red-600">
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={showDiscountColumn ? 8 : 7} className="px-4 py-6 text-center text-gray-400">
                  ยังไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Phase H — Preview ผลรวมก่อนยืนยัน (ลำดับเดียวกับ Summary บนเอกสารจริง) —
          ตัวเลขสุดท้ายบนเอกสารมาจากการคำนวณฝั่ง Server ด้วยสูตร/การปัดเศษเดิมของระบบ */}
      {items.length > 0 && (
        <div className="bg-white border rounded-lg p-4 mb-3 text-sm ml-auto max-w-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">รวมเป็นเงิน / Subtotal</span>
            <span>{fmt(gross)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">หักส่วนลด / Discount</span>
            <span className={discountInvalid ? "text-red-600 font-medium" : ""}>{fmt(discountTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">ยอดรวมหลังหักส่วนลด / After Discount</span>
            <span>{fmt(net)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">มูลค่าสินค้าก่อน VAT</span>
            <span>{fmt(valueAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">ภาษีมูลค่าเพิ่ม / VAT {vatPctToday}% (รวมในยอดแล้ว)</span>
            <span>{fmt(vatAmount)}</span>
          </div>
          <div className="flex justify-between font-medium border-t pt-1">
            <span>ยอดสุทธิ / Net Amount</span>
            <span>{fmt(net)}</span>
          </div>
          {discountInvalid && (
            <p className="text-xs text-red-600 pt-1">ส่วนลดติดลบหรือเกินยอดของรายการ/เอกสาร — แก้ไขก่อนสร้างเอกสาร</p>
          )}
        </div>
      )}

      <form action={createAction} id="taxInvoiceForm">
        <input
          type="hidden"
          name="itemsJson"
          value={JSON.stringify(
            items.map(({ description, size, quantity, unit, unitPrice, discountAmount }) => ({
              description,
              size,
              quantity,
              unit,
              unitPrice,
              discountAmount: round2(discountAmount || 0),
            }))
          )}
        />
        <input type="hidden" name="discountMode" value={discountMode} />
        <button
          type="submit"
          disabled={items.length === 0 || discountInvalid}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2"
        >
          ✓ สร้างใบกำกับภาษี
        </button>
      </form>
    </div>
  );
}
