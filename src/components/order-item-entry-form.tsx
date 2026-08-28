"use client";

import { useState, useRef, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { ProductSearchPicker, type PickedProduct, type UnresolvedSizeInfo, type ModelResult } from "@/components/product-search-picker";
import { ModelSizeSelect, type ModelSizeResolution } from "@/components/model-size-select";

// Owner UAT Round 3 — ข้อ 3: เปลี่ยนฟอร์มนี้ให้เป็น Grid เดียวกับ Manual Tax Invoice
// ทุกประการ (สินค้า/รุ่น | รายการ | ขนาด | จำนวน | หน่วย | ราคา/หน่วย | ปุ่มเพิ่ม) —
// ราคาที่เห็นเป็นแค่ "ราคาแนะนำ" จาก Pricing Engine ตัวเดียวกับที่ Confirm ใช้จริง
// (getEffectivePrice ผ่าน getSuggestedOrderItemPrice) ถ้าผู้ใช้ไม่แก้ไข ราคาจะไม่ถูก
// Freeze เป็น unitPriceOverride เลย (รายการ Standard ยังคำนวณสดอีกครั้งตอน Confirm ตาม
// Invariant เดิม) แก้ไขราคาที่แนะนำเองเมื่อไหร่ ถึงจะกลายเป็น Override จริง — เหมือนกับ
// ที่ "ขนาด" ของสินค้า Standalone (ไม่มีรุ่น) พิมพ์เองได้อิสระ (sizeOverride ไม่ผูกกับ
// unitPriceOverride อยู่แล้วในระดับ Schema — ส่งแยกกันได้เสมอ)
//
// R4 — Size Architecture Path A: ค้นหาสินค้าเปลี่ยนไปใช้ ProductSearchPicker ร่วมกัน
// (Model → เลือก Size / สินค้า Standalone) แทน Search ตรงๆ แบบเดิม
//
// R6 Phase B — เลือก Size ที่ยังไม่มี Product จริงรองรับ (Standard ที่ยังไม่ตั้งราคา หรือ
// ขนาดพิเศษ) ต้องกรอก Size/ราคาเองก่อนถึงจะเพิ่มรายการได้ (ยังต้องมี Anchor Product จริง
// ของ Model เดิมเสมอ เพราะ OrderItem.productId เป็น Required FK)
export function OrderItemEntryForm({
  addAction,
  suggestPriceAction,
  canManageProducts = false,
  customerId,
  guestQuotation,
}: {
  addAction: (formData: FormData) => Promise<ActionResult>;
  /** Owner UAT Round 3 — ข้อ 3: Bind ล่วงหน้าจาก Parent ด้วย customerId/branchId/orderDate
   * จริงของเอกสารนี้แล้ว — คืนราคาแนะนำอย่างเดียว ไม่ใช่ Business Logic ใหม่ */
  suggestPriceAction: (productId: string) => Promise<{ price: number }>;
  /** R6 Phase B — คุมว่าจะโชว์ลิงก์ไปหน้ารุ่นสินค้าตอนไซส์ที่เลือกยังไม่มี Product จริงไหม (product.edit) */
  canManageProducts?: boolean;
  /** R8 — บริษัทลูกค้าของเอกสารนี้: ส่งต่อให้ Picker กรองเฉพาะสินค้าที่เปิดให้บริษัทนี้ */
  customerId?: string;
  /** R10 — ใบเสนอราคาแบบกรอกข้อมูลเอง (Guest): Picker เห็นเฉพาะ "สินค้าเสนอราคา" + ส่วนกลาง */
  guestQuotation?: boolean;
}) {
  const [selected, setSelected] = useState<PickedProduct | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelResult | null>(null);
  const [unresolvedInfo, setUnresolvedInfo] = useState<UnresolvedSizeInfo | null>(null);
  const [overrideSize, setOverrideSize] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  // Owner UAT Round 3 — ข้อ 4: ขนาดพิมพ์เองสำหรับสินค้า Standalone (ไม่มีรุ่น) — ไม่บังคับ
  // กรอก ส่งเป็น sizeOverride เฉยๆ (ไม่ผูกกับราคา ไม่ต้องมี unitPriceOverride คู่กัน)
  const [standaloneSize, setStandaloneSize] = useState("");
  const [descriptionOverride, setDescriptionOverride] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [suggestPending, startSuggestTransition] = useTransition();
  const [quantity, setQuantity] = useState("");
  const qtyRef = useRef<HTMLInputElement>(null);
  const { showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);

  if (thrownError) throw thrownError;

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
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  function handleUnresolvedSize(info: UnresolvedSizeInfo | null) {
    // Owner UAT — ข้อ 4: ต้องล้าง selectedModel ด้วย ไม่งั้นช่อง "ขนาด" จะค้างเป็น
    // <ModelSizeSelect> ต่อ (Ternary เช็ค selectedModel ก่อน unresolvedInfo เสมอ) ทำให้
    // ไม่มีทางพิมพ์ค่า "ขนาดพิเศษ/ระบุเอง" จริงๆ ได้เลยทาง UI (Bug เดิมตั้งแต่ R6 Phase B
    // — เจอตอน Live UAT รอบนี้ ไม่ใช่จาก Session นี้เปลี่ยน แต่ต้องแก้เพราะอยู่ใน Scope
    // ข้อ 4 โดยตรง "Custom Size uses user-entered Size+Price")
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

  // Owner UAT Fix Batch 1 — ข้อ 2: ล้างเฉพาะสินค้า/ขนาด/ราคาที่เลือกไว้ — ไม่แตะจำนวนที่
  // พิมพ์ไว้แล้วหรือ Field อื่นของฟอร์ม
  function handleClear() {
    setSelected(null);
    setSelectedModel(null);
    setUnresolvedInfo(null);
    setOverrideSize("");
    setOverridePrice("");
    setStandaloneSize("");
    setPriceInput("");
    setPriceTouched(false);
  }

  const overrideReady = !!unresolvedInfo?.anchorProductId && overrideSize.trim() !== "" && Number(overridePrice) > 0;
  const canAdd = !!selected || overrideReady;
  const effectiveProductId = selected?.id ?? unresolvedInfo?.anchorProductId ?? "";
  const effectiveUnit = selected?.unit ?? unresolvedInfo?.unit ?? "";

  function handleQtyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending || !canAdd) return;
    const formData = new FormData();
    formData.set("productId", effectiveProductId);
    formData.set("quantity", quantity);
    // Owner UAT (2026-08-23) — เดิมต่อท้าย Description ด้วยขนาด (`${modelName} ${size}`)
    // ทำให้คอลัมน์ "รายการ" กับ "ขนาด" ซ้ำข้อมูลกันบนหน้าพิมพ์/หน้าคีย์เอกสาร (ขนาดมีคอลัมน์
    // ของตัวเองอยู่แล้ว) — ใช้ modelName เดี่ยวๆ เหมือน Pattern เดียวกับ Manual Tax
    // Invoice/Repair Note Entry ที่ไม่เคยมีปัญหานี้
    const desc = descriptionOverride.trim() || (unresolvedInfo ? unresolvedInfo.modelName : "");
    if (desc) formData.set("descriptionOverride", desc);
    const sizeToSend = unresolvedInfo ? overrideSize.trim() : standaloneSize.trim();
    if (sizeToSend) formData.set("sizeOverride", sizeToSend);
    if (unresolvedInfo) {
      formData.set("unitPriceOverride", overridePrice);
    } else if (priceTouched && priceInput !== "") {
      formData.set("unitPriceOverride", priceInput);
    }

    startTransition(async () => {
      try {
        const result = await addAction(formData);
        if (!result.success) showError(result.error);
        // สำเร็จ: ไม่ต้องทำอะไรเพิ่ม — parent จะ remount component นี้เอง
        // ผ่าน key={order.items.length} หลัง revalidatePath ทำให้ฟอร์มล้างอัตโนมัติ
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-3">
      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
        <div className="col-span-2 sm:col-span-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            สินค้า/รุ่น — เลือกด้วยลูกศร/Enter
          </label>
          <ProductSearchPicker
            customerId={customerId}
            guestQuotation={guestQuotation}
            onPick={pick}
            onUnresolvedSize={handleUnresolvedSize}
            onModelSelected={setSelectedModel}
            onClear={handleClear}
            autoFocus
            placeholder="เช่น M001 หรือ ที่นอนสปริง"
          />
        </div>
        <div className="col-span-1">
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
            ref={qtyRef}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            type="number"
            // Owner UAT (2026-08-23) — จำนวนสินค้าเป็นจำนวนเต็มเสมอ: ลูกศรขึ้น/ลงต้องขยับ
            // ทีละ 1 (เดิม step 0.01 ขยับเป็นทศนิยม) — เหมือนกันทุกฟอร์มคีย์สินค้า
            step="1"
            min="1"
            required
            onKeyDown={handleQtyKeyDown}
            className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">หน่วย</label>
          <input value={effectiveUnit} disabled readOnly className="w-full border rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-500" />
        </div>
        {/* R11 UAT (2026-08-28) — Owner: ช่องราคาแคบเกินไป ตัวเลขหลักพัน/หมื่นแสดงไม่ครบ —
            ขยายจาก 1 เป็น 2 คอลัมน์ (หัก "รายการ" ลง 1 คอลัมน์ให้ รวมยังเป็น 12 เท่าเดิม) */}
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
            className="w-full border rounded px-3 py-1.5 text-sm disabled:bg-gray-50"
          />
        </div>
        <div className="col-span-1">
          <button
            type="submit"
            disabled={!canAdd || isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-2 py-2"
          >
            {isPending ? "..." : "+ เพิ่ม"}
          </button>
        </div>
      </div>
      {unresolvedInfo && !unresolvedInfo.anchorProductId && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
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
        <p className="mt-1 text-xs text-amber-700">
          ไซส์มาตรฐานนี้ยังไม่มีในระบบ — ราคาที่กรอกใช้เฉพาะรายการนี้ ไม่บันทึกเป็นราคามาตรฐาน
        </p>
      )}
    </form>
  );
}
