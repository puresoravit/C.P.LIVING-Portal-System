"use client";

import { useState, useEffect, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { ProductSearchPicker, type PickedProduct, type UnresolvedSizeInfo, type ModelResult } from "@/components/product-search-picker";
import { ModelSizeSelect, type ModelSizeResolution } from "@/components/model-size-select";

type EditItem = {
  key: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  productTypeName: string;
  quantity: number;
  descriptionOverride: string;
  // R6 Phase B — ขนาดพิเศษ/ระบุเอง ("" = Standard Size ปกติ ไม่ Override อะไรเลย) — ใช้
  // ตอน Submit เท่านั้น ห้ามใช้แสดงผลตรงๆ (ดู sizeDisplay ด้านล่าง)
  sizeOverride: string;
  // Owner UAT — ข้อ 4: Field แสดงผลอย่างเดียว (Standard Size ก็มีค่าด้วย ไม่ใช่แค่ Custom
  // Size เหมือน sizeOverride) — แยกออกมาต่างหากเพื่อไม่ให้กระทบ Logic เดิมที่เช็ค
  // !!sizeOverride เพื่อสื่อ "รายการนี้เป็น Custom Size" ตอน Submit (handleSubmit ด้านล่าง)
  sizeDisplay: string;
  unitPriceOverride: number | null;
  // Owner UAT Round 3 — ข้อ 3: เหมือน OrderEditModal ทุกประการ — โชว์อย่างเดียว ไม่ส่งไป Server
  displayPrice: number | null;
};

// แก้ไข Quotation ที่ CONFIRMED แล้ว — Re-snapshot ใบเดิม (เลขที่เดิม, revisionNo+1)
// ต่างจาก OrderEditModal (E3) ตรงที่ไม่มี Downstream Chain ต้อง Cancel/สร้างใหม่ —
// ส่งรายการ+VAT Mode ทั้งชุดไปคำนวณ/Snapshot ใหม่ในครั้งเดียว
export function QuotationEditModal({
  quotationNumber,
  nextDisplayNumber,
  initialItems,
  initialVatMode,
  initialApplyDiscount,
  action,
  suggestPriceAction,
  canManageProducts = false,
}: {
  quotationNumber: string;
  /** Owner UAT Fix Batch — ข้อ 3: เลขที่เอกสารที่จะได้หลังบันทึกครั้งนี้ (มี Suffix -N ต่อ
   * ท้ายแล้วถ้าจำเป็น) — ใช้บอก User ในข้อความเตือนแทนคำว่า "Rev." */
  nextDisplayNumber: string;
  initialItems: EditItem[];
  initialVatMode: string;
  initialApplyDiscount: boolean;
  action: (formData: FormData) => Promise<ActionResult>;
  /** Owner UAT Round 3 — ข้อ 3: เหมือน OrderEditModal ทุกประการ */
  suggestPriceAction: (productId: string) => Promise<{ price: number }>;
  canManageProducts?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<EditItem[]>(initialItems);
  const [vatMode, setVatMode] = useState(initialVatMode);
  // R3 — เปลี่ยนการใช้ส่วนลดได้ตอน Revision เช่นเดียวกับ VAT Mode ที่เปลี่ยนได้อยู่แล้ว
  const [applyDiscount, setApplyDiscount] = useState(initialApplyDiscount);

  const [qty, setQty] = useState("1");
  const [selected, setSelected] = useState<PickedProduct | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelResult | null>(null);
  // R6 Phase B — เหมือน OrderEditModal ทุกประการ
  const [unresolvedInfo, setUnresolvedInfo] = useState<UnresolvedSizeInfo | null>(null);
  const [overrideSize, setOverrideSize] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  const [standaloneSize, setStandaloneSize] = useState("");
  const [descriptionOverride, setDescriptionOverride] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [suggestPending, startSuggestTransition] = useTransition();
  // R4 — ตัว Modal นี้ไม่ remount ProductSearchPicker ระหว่างเพิ่มรายการหลายรายการ
  // (ต่างจากหน้า Draft ที่ remount ด้วย key) จึงต้องสั่งล้าง Search ภายในเองผ่าน resetToken
  const [pickerResetToken, setPickerResetToken] = useState(0);

  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;
    setItems(initialItems);
    setVatMode(initialVatMode);
    setApplyDiscount(initialApplyDiscount);
    resetEntryRow();
    setPickerResetToken((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialItems, initialVatMode, initialApplyDiscount]);

  function resetEntryRow() {
    setSelected(null);
    setSelectedModel(null);
    setUnresolvedInfo(null);
    setOverrideSize("");
    setOverridePrice("");
    setStandaloneSize("");
    setDescriptionOverride("");
    setPriceInput("");
    setPriceTouched(false);
    setQty("1");
  }

  function fetchSuggestedPrice(productId: string) {
    startSuggestTransition(async () => {
      try {
        const { price } = await suggestPriceAction(productId);
        setPriceInput(String(price));
      } catch (err) {
        unstable_rethrow(err);
      }
    });
  }

  function pick(p: PickedProduct) {
    setSelected(p);
    setUnresolvedInfo(null);
    setStandaloneSize("");
    setPriceInput("");
    setPriceTouched(false);
    fetchSuggestedPrice(p.id);
  }

  function handleUnresolvedSize(info: UnresolvedSizeInfo | null) {
    // Owner UAT — ข้อ 4: เหมือน order-item-entry-form.tsx ทุกประการ — ต้องล้าง
    // selectedModel ด้วย ไม่งั้นช่อง "ขนาด" จะค้างเป็น <ModelSizeSelect> ต่อ ทำให้ไม่มีทาง
    // พิมพ์ค่า "ขนาดพิเศษ/ระบุเอง" จริงๆ ได้เลยทาง UI
    setSelectedModel(null);
    setSelected(null);
    setUnresolvedInfo(info);
    setOverrideSize(info && !info.custom ? info.size : "");
    setOverridePrice("");
  }

  function handleSizeResolve(result: ModelSizeResolution) {
    if (!result) return;
    if ("picked" in result) pick(result.picked);
    else handleUnresolvedSize(result.unresolved);
  }

  const overrideReady = !!unresolvedInfo?.anchorProductId && overrideSize.trim() !== "" && Number(overridePrice) > 0;
  const canAddItem = !!selected || overrideReady;

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
          name: descriptionOverride.trim() || selected.name,
          unit: selected.unit,
          productTypeName: selected.productTypeName,
          quantity,
          descriptionOverride: descriptionOverride.trim(),
          sizeOverride: standaloneSize.trim(),
          sizeDisplay: selected.size || standaloneSize.trim(),
          unitPriceOverride: priceTouched && priceInput !== "" ? Number(priceInput) : null,
          displayPrice: priceInput !== "" ? Number(priceInput) : null,
        },
      ]);
    } else if (overrideReady && unresolvedInfo) {
      setItems((prev) => [
        ...prev,
        {
          key: `${unresolvedInfo.anchorProductId}-${Date.now()}`,
          productId: unresolvedInfo.anchorProductId!,
          sku: "-",
          // Owner UAT (2026-08-23) — ห้ามต่อท้ายขนาดใน name (คอลัมน์ "ขนาด" แยกแสดงอยู่แล้ว
          // ใน items.map ด้านล่าง — ดู sizeDisplay) กันซ้ำซ้อนกับคอลัมน์ "รายการ"
          name: descriptionOverride.trim() || unresolvedInfo.modelName,
          unit: unresolvedInfo.unit,
          productTypeName: unresolvedInfo.productTypeName,
          quantity,
          descriptionOverride: descriptionOverride.trim(),
          sizeOverride: overrideSize.trim(),
          sizeDisplay: overrideSize.trim(),
          unitPriceOverride: Number(overridePrice),
          displayPrice: Number(overridePrice),
        },
      ]);
    } else {
      return;
    }
    resetEntryRow();
    setPickerResetToken((t) => t + 1);
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
      JSON.stringify(
        items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          descriptionOverride: i.descriptionOverride || (i.sizeOverride ? i.name : undefined),
          sizeOverride: i.sizeOverride || undefined,
          unitPriceOverride: i.unitPriceOverride ?? undefined,
        }))
      )
    );
    formData.set("vatMode", vatMode);
    formData.set("applyDiscount", applyDiscount ? "1" : "0");
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        showSuccess(`แก้ไขใบเสนอราคาสำเร็จ (เลขที่เอกสาร: ${nextDisplayNumber})`);
        setIsOpen(false);
      } else {
        showError(result.error);
      }
    });
  }

  function money(n: number) {
    return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
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
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">แก้ไขใบเสนอราคา {quotationNumber}</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
                ×
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                การบันทึกจะปรับปรุงใบเสนอราคาใบนี้ — เลขที่เอกสารจะเปลี่ยนเป็น <b>{nextDisplayNumber}</b> เพื่อแยกจากฉบับก่อนหน้าอย่างชัดเจน
                (ราคา/ส่วนลด/VAT จะถูกคำนวณใหม่ทั้งหมดตามรายการที่แก้ไข ฉบับก่อนหน้ายังตรวจสอบย้อนหลังได้ผ่าน Audit Log ตามปกติ)
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
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">รหัสสินค้า</th>
                      <th className="px-3 py-2 font-medium">รายการ</th>
                      <th className="px-3 py-2 font-medium">ขนาด</th>
                      <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                      <th className="px-3 py-2 font-medium">หน่วย</th>
                      <th className="px-3 py-2 font-medium text-right">ราคา/หน่วย</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.key} className="border-t">
                        <td className="px-3 py-2 font-mono">{item.sku}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.sizeDisplay || "-"}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2">{item.unit}</td>
                        <td className="px-3 py-2 text-right">{item.displayPrice != null ? money(item.displayPrice) : "-"}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeItem(item.key)} className="text-xs text-gray-500 hover:text-red-600">
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                          ยังไม่มีรายการสินค้า
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>

              <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                  <div className="col-span-2 sm:col-span-4">
                    <label className="block text-xs font-medium text-gray-600 mb-1">สินค้า/รุ่น</label>
                    <ProductSearchPicker
                      onPick={pick}
                      onUnresolvedSize={handleUnresolvedSize}
                      onModelSelected={setSelectedModel}
                      onClear={resetEntryRow}
                      placeholder="เช่น M001 หรือ ที่นอนสปริง"
                      resetToken={pickerResetToken}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">รายการ (ถ้ามี)</label>
                    <input
                      value={descriptionOverride}
                      onChange={(e) => setDescriptionOverride(e.target.value)}
                      placeholder={selected?.name ?? "รายละเอียดเพิ่มเติม"}
                      className="w-full border rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      ขนาด{unresolvedInfo?.custom ? " *" : ""}
                    </label>
                    {selectedModel ? (
                      <ModelSizeSelect model={selectedModel} onResolve={handleSizeResolve} />
                    ) : unresolvedInfo ? (
                      <input
                        value={overrideSize}
                        onChange={(e) => setOverrideSize(e.target.value)}
                        placeholder={unresolvedInfo.custom ? "เช่น 4.2 เมตร" : unresolvedInfo.size}
                        className="w-full border rounded px-3 py-1.5 text-sm"
                      />
                    ) : (
                      <input
                        value={standaloneSize}
                        onChange={(e) => setStandaloneSize(e.target.value)}
                        placeholder="เช่น 5 ฟุต (ถ้ามี)"
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
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">ราคา/หน่วย{unresolvedInfo ? " *" : ""}</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={unresolvedInfo ? overridePrice : priceInput}
                      placeholder={suggestPending ? "กำลังคำนวณ..." : undefined}
                      disabled={!selected && !unresolvedInfo}
                      onChange={(e) => {
                        if (unresolvedInfo) {
                          setOverridePrice(e.target.value);
                        } else {
                          setPriceInput(e.target.value);
                          setPriceTouched(true);
                        }
                      }}
                      className="w-full border rounded px-3 py-1.5 text-sm disabled:bg-gray-100"
                    />
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      disabled={!canAddItem}
                      onClick={addItem}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-2 py-2"
                    >
                      + เพิ่ม
                    </button>
                  </div>
                </div>
                {unresolvedInfo && !unresolvedInfo.anchorProductId && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    รุ่น &quot;{unresolvedInfo.modelName}&quot; ยังไม่มีสินค้าในระบบเลย ต้องตั้งราคาต่อฟุตหรือเพิ่มไซส์ก่อนจึงจะคีย์เอกสารได้{" "}
                    {canManageProducts ? (
                      <a href={unresolvedInfo.manageHref} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        ไปตั้งค่าที่หน้ารุ่นสินค้า
                      </a>
                    ) : (
                      "กรุณาติดต่อผู้ดูแลระบบ"
                    )}
                  </div>
                )}
                {unresolvedInfo?.anchorProductId && !unresolvedInfo.custom && (
                  <p className="text-xs text-amber-700">
                    ไซส์มาตรฐานนี้ยังไม่มีในระบบ — ราคาที่กรอกใช้เฉพาะรายการนี้ ไม่บันทึกเป็นราคามาตรฐาน
                  </p>
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
