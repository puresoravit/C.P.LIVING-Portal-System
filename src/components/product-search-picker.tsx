"use client";

import { useState, useEffect } from "react";

// R4 — Size Architecture Path A: "ค้นหารุ่นสินค้า → เลือก Size" (Model ก่อน แล้วเลือก
// Size จาก Size ที่มีอยู่จริงของรุ่นนั้นเท่านั้น) — Resolve ไปหา Product/SKU/ราคาจริง
// ด้านหลังให้อัตโนมัติ ไม่ให้ User ต้องพิมพ์/จำ SKU ที่มี Size ต่อท้ายเอง — สินค้าที่ไม่มี
// Model (Standalone เช่น หมอน/Accessory) ยังค้นหา/เลือกตรงๆ ได้เหมือนเดิมทุกประการ
// ไม่บังคับผ่าน Size
//
// Owner UAT Round 3 — ข้อ 4: Picker เองไม่เรนเดอร์ช่อง "ขนาด" อีกต่อไป (เดิมโผล่ Dropdown
// ขึ้นข้างช่องค้นหาเองหลังเลือก Model — Owner มองว่าเป็น Dropdown ซ่อนที่ไม่ต้องการ) —
// ช่องค้นหาตอนนี้ทำหน้าที่แค่ "เลือกสินค้า/รุ่น" อย่างเดียว เลือก Model แล้วส่งต่อผ่าน
// onModelSelected ให้ Parent เรนเดอร์ Control ขนาดของตัวเอง (ปกติ <ModelSizeSelect> คู่กับ
// ช่อง "ขนาด" ที่มีอยู่แล้วในตาราง/ฟอร์ม) แล้วเรียก resolveModelSize() แปลงกลับมาเป็น
// onPick/onUnresolvedSize เอง — ยังคง Resolve ไปหา Product Variant จริงเบื้องหลังทุก
// ประการ ไม่มี Pricing Path ใหม่ ไม่มี Query ใหม่ (Model Result จาก /api/products/search
// เดิมมี sizes[] มาให้ครบอยู่แล้วตั้งแต่ R4)
//
// R6 Phase B — Size ที่เลือกได้ตอนนี้อาจเป็น "ยังไม่มี Product จริง" ได้ 2 กรณี: (1)
// Standard Size ที่ยังไม่ได้ตั้ง pricePerFoot (Edge Case หายาก) (2) "ขนาดพิเศษ/ระบุเอง"
// ที่ตั้งใจไม่มี Product ตายตัว — ทั้งคู่ยิง onUnresolvedSize แทน onPick ให้ Parent
// ตัดสินใจเอง (Order/Quotation ต้องมี productId Anchor จริงเสมอ, Tax Invoice ไม่ต้องมี
// เพราะ Schema เป็น Free-text Snapshot อยู่แล้ว) — ตัว Picker เองไม่รู้ Business Rule
// ปลายทาง แค่ส่งข้อมูลที่ Resolve ได้เท่าที่ทำได้ไปให้ ไม่มีการคำนวณราคาใดๆ ในนี้เลย
export type PickedProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  productTypeName: string;
  // Owner UAT Fix Batch 1 — ข้อ 5: modelName (ไม่รวม Size) + size แยกออกมาต่างหาก
  // (Additive, Optional) ให้ผู้เรียกที่ต้องการแสดง Size เป็นคอลัมน์แยก (เช่น
  // RepairNoteItemEntry) ใช้ได้โดยไม่กระทบ Consumer เดิมที่ใช้แค่ name รวม
  size?: string;
  modelName?: string;
};

export type UnresolvedSizeInfo = {
  modelId: string;
  modelName: string;
  productTypeName: string;
  unit: string;
  size: string; // Label แนะนำเริ่มต้น (Standard Size ที่ยังไม่มี Variant) หรือ "" (ขนาดพิเศษ)
  custom: boolean;
  anchorProductId: string | null; // Product จริงตัวใดตัวหนึ่งของ Model นี้ (ถ้ามี) ไว้ผูก FK เมื่อต้องการ Override ราคา/ขนาด
  // Owner UAT — ข้อ 1: ลิงก์ "ไปตั้งค่า" ที่ถูกต้องตามชนิดของ Family — /product-models/{id}
  // สำหรับ ProductModel จริง, /products/{id} สำหรับ Product ที่เป็น Anchor ของตัวเอง
  manageHref: string;
};

export type ModelSizeOption = {
  productId: string | null;
  sku: string | null;
  unit: string;
  size: string;
  label: string;
  resolved: boolean;
  custom: boolean;
};
export type ModelResult = {
  modelId: string;
  modelName: string;
  productTypeName: string;
  usesSize: boolean;
  sizes: ModelSizeOption[];
  // Owner UAT — ข้อ 1: Family นี้อาจเป็น ProductModel จริง หรือ Product ที่ตั้ง pricePerFoot
  // เป็น Anchor ของตัวเอง — Server (/api/products/search) คำนวณสองค่านี้มาให้ตรงชนิดแล้ว
  // ไม่ต้องเดา/derive ฝั่ง Client อีก (ProductModel เองไม่ใช่ Product แถวจริง ผูก FK ไม่ได้
  // โดยตรง จึงต้องมี Field แยกจาก modelId ชัดเจน)
  anchorProductId: string | null;
  manageHref: string;
};
type ProductResult = { id: string; sku: string; name: string; unit: string; productTypeName: string };

// Owner UAT Round 3 — ข้อ 4: Parent เป็นคนเรนเดอร์ช่อง "ขนาด" ของตัวเอง (Select ตอนเลือก
// Model, Free-text ตอนไม่ใช่) แทนที่ Picker จะโผล่ Dropdown ขนาดแทรกขึ้นมาข้างช่องค้นหา
// เอง (Owner มองว่าเป็น "Dropdown ซ่อน" ที่ยังไม่อยากให้มี) — ฟังก์ชันนี้แปลง Index ที่
// เลือกจาก model.sizes กลับเป็นผลลัพธ์แบบเดียวกับที่ Picker เดิมเคยยิงให้เป๊ะ (Resolve
// จริง หรือ Unresolved) ไม่มี Pricing Logic ใหม่ ใช้ sizeOptionToPicked/Unresolved เดิม
export function resolveModelSize(
  model: ModelResult,
  sizeIndex: number
): { picked: PickedProduct } | { unresolved: UnresolvedSizeInfo } | null {
  const s = model.sizes[sizeIndex];
  if (!s) return null;
  return s.resolved ? { picked: sizeOptionToPicked(model, s) } : { unresolved: sizeOptionToUnresolved(model, s) };
}

function sizeOptionToPicked(model: ModelResult, s: ModelSizeOption): PickedProduct {
  // Owner UAT (2026-08-23) — ห้ามประกอบขนาดต่อท้ายชื่อ (เดิม `${modelName} ${size}`) —
  // ขนาดมี Field/คอลัมน์ของตัวเองแยกอยู่แล้วทุกจุดที่แสดงผล (ดู Root Cause เต็มใน
  // product-variant-size.ts)
  const name = model.modelName;
  return {
    id: s.productId!,
    sku: s.sku!,
    name,
    unit: s.unit,
    productTypeName: model.productTypeName,
    size: s.size || undefined,
    modelName: model.modelName,
  };
}

function sizeOptionToUnresolved(model: ModelResult, s: ModelSizeOption): UnresolvedSizeInfo {
  return {
    modelId: model.modelId,
    modelName: model.modelName,
    productTypeName: model.productTypeName,
    unit: s.unit,
    size: s.custom ? "" : s.label,
    custom: s.custom,
    // Owner UAT — ข้อ 1: ใช้ค่าที่ Server คำนวณมาให้ตรงชนิดแล้ว (ProductModel ต้องมี Variant
    // จริงอย่างน้อย 1 ตัวถึงจะมี Anchor, Product Anchor เป็น Product แถวจริงอยู่แล้วเสมอ)
    anchorProductId: model.anchorProductId,
    manageHref: model.manageHref,
  };
}

/** R8 — Hook ติดตามค่าบริษัทลูกค้าจาก <select id="..."> ที่ Server Page เรนเดอร์ไว้นอก
 * Component นี้ (Pattern หน้า repair-notes/new และ tax-invoices/new ที่ฟอร์มหัวเอกสารเป็น
 * Server-rendered + Inline Script เดิม) — ให้ Client Item Entry รู้บริษัทที่เลือกอยู่จริง
 * เพื่อส่งต่อให้ ProductSearchPicker กรองสินค้า — คืน undefined เมื่อยังไม่เลือก/ไม่พบ Element */
export function useCustomerSelectValue(selectId = "customerSelect"): string | undefined {
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const el = document.getElementById(selectId) as HTMLSelectElement | null;
    if (!el) return;
    const sync = () => setCustomerId(el.value || undefined);
    sync();
    el.addEventListener("change", sync);
    return () => el.removeEventListener("change", sync);
  }, [selectId]);
  return customerId;
}

export function ProductSearchPicker({
  onPick,
  onUnresolvedSize,
  onModelSelected,
  onClear,
  autoFocus,
  placeholder = "เช่น GT-David หรือ M001",
  resetToken,
  customerId,
}: {
  /** R8 — Product Assignment ตามบริษัทลูกค้า: ส่งมาเมื่อเอกสารรู้บริษัทลูกค้าแล้ว →
   * ผลค้นหาถูกกรองฝั่ง Server ให้เหลือเฉพาะสินค้าที่เปิดให้บริษัทนั้น (ดู
   * /api/products/search) — ไม่ส่ง = เห็นทุกสินค้าเหมือนเดิมทุกประการ */
  customerId?: string;
  onPick: (p: PickedProduct) => void;
  /** R6 Phase B — เรียกเมื่อเลือก Size ที่ยังไม่มี Product จริงรองรับ (Standard ที่ยังไม่ตั้งราคา หรือขนาดพิเศษ) — ไม่ implement = พฤติกรรมเดิม (ตัวเลือกนั้นจะเลือกไม่ได้จริง เพราะไม่มี onPick ให้เรียก) */
  onUnresolvedSize?: (info: UnresolvedSizeInfo | null) => void;
  /** Owner UAT Round 3 — ข้อ 4: เรียกเมื่อเลือก Model จาก Dropdown ค้นหาแล้วมีมากกว่า 1
   * ขนาดให้เลือก (ต้องให้ผู้ใช้เลือกเอง) — Picker เองไม่เรนเดอร์ช่อง "ขนาด" อีกต่อไป ส่งต่อ
   * Model ให้ Parent เรนเดอร์ Control ของตัวเอง (เช่นผ่าน <ModelSizeSelect>) แล้วเรียก
   * resolveModelSize() กลับมาแปลงเป็น onPick/onUnresolvedSize เอง — เรียกด้วย null ตอนล้าง
   * (Model ที่มีขนาดเดียวและ Resolve ได้จริง ยัง Auto-pick ทันทีเหมือนเดิม ไม่เรียกนี้) */
  onModelSelected?: (model: ModelResult | null) => void;
  /** Owner UAT Fix Batch 1 — ข้อ 2: ปุ่ม × ล้างค่าค้นหา/สินค้าที่เลือกไว้ — เรียกหลังจาก
   * ล้าง State ภายในของ Picker เองเสร็จแล้ว ให้ Parent ล้าง Size/ราคา/ตัวเลือกที่ผูกกับ
   * การเลือกนี้ต่อ (ไม่แตะ Field อื่นที่ไม่เกี่ยวข้อง เช่น ลูกค้า/สาขา/วันที่/จำนวน) */
  onClear?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  /** เปลี่ยนค่านี้ (เช่น ++ ทุกครั้งที่ Parent Add สำเร็จ) เพื่อล้าง Search/Selection ภายใน */
  resetToken?: number;
}) {
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<ModelResult[]>([]);
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [picked, setPicked] = useState(false);
  // Model ที่เลือกไว้ (รอ Parent เรนเดอร์ช่อง Size ของตัวเองต่อ ผ่าน onModelSelected) —
  // ต่างจาก activeModel เดิมที่ใช้ Drill-down ภายใน Dropdown เดียวกัน ตัวนี้ทำให้ Dropdown
  // ค้นหาปิดไปเลยหลังเลือก Model
  const [selectedModel, setSelectedModel] = useState<ModelResult | null>(null);
  // ข้อ 60: รองรับเลือกด้วยลูกศร/Enter เหมือนเดิม — ใช้กับรายการ Model/Product ในช่อง
  // ค้นหาเท่านั้น (Size เป็น <select> เดิมของ Browser มี Keyboard Nav ของตัวเองอยู่แล้ว)
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    setQuery("");
    setModels([]);
    setProducts([]);
    setPicked(false);
    setSelectedModel(null);
    setHighlightIndex(0);
    onUnresolvedSize?.(null);
    onModelSelected?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useEffect(() => {
    if (!query || selectedModel || picked) {
      setModels([]);
      setProducts([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const customerParam = customerId ? `&customerId=${encodeURIComponent(customerId)}` : "";
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}${customerParam}`);
        const data = await res.json();
        setModels(data.models ?? []);
        setProducts(data.products ?? []);
        setHighlightIndex(0);
      } catch {
        setModels([]);
        setProducts([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, selectedModel, picked, customerId]);

  function pickProduct(p: ProductResult) {
    setQuery(`${p.sku} — ${p.name}`);
    setPicked(true);
    setModels([]);
    setProducts([]);
    setSelectedModel(null);
    onUnresolvedSize?.(null);
    onModelSelected?.(null);
    onPick(p);
  }

  // เลือก Model จาก Dropdown ค้นหา — ปิด Dropdown ค้นหาทันที (ไม่ใช่ Drill-down ต่อใน
  // Dropdown เดิม) — ถ้า Model มี Size ตัวเลือกเดียวและ Resolve ได้จริง ให้อัตโนมัติเลย
  // (ไม่บังคับเลือกจากตัวเลือกเดียวที่ไม่มีความหมาย) ไม่งั้นส่งต่อให้ Parent เรนเดอร์ช่อง
  // ขนาดของตัวเอง (Owner UAT Round 3 — ข้อ 4)
  function selectModel(m: ModelResult) {
    setQuery(`รุ่น: ${m.modelName}`);
    setModels([]);
    setProducts([]);
    setSelectedModel(m);
    onUnresolvedSize?.(null);
    if (m.sizes.length === 1 && m.sizes[0].resolved) {
      setPicked(true);
      onModelSelected?.(null);
      onPick(sizeOptionToPicked(m, m.sizes[0]));
    } else {
      setPicked(false);
      onModelSelected?.(m);
    }
  }

  // Owner UAT Fix Batch 1 — ข้อ 2: ล้างเฉพาะ State ภายในของ Picker เอง (ค้นหา/Model/Size
  // ที่เลือกไว้) แล้วแจ้ง Parent ผ่าน onClear ให้ล้าง Size Override/ราคาที่ผูกกับการเลือก
  // นี้ต่อ — ไม่แตะ Field อื่นของฟอร์ม (ลูกค้า/สาขา/วันที่/จำนวน ฯลฯ)
  function clear() {
    setQuery("");
    setModels([]);
    setProducts([]);
    setPicked(false);
    setSelectedModel(null);
    setHighlightIndex(0);
    onUnresolvedSize?.(null);
    onModelSelected?.(null);
    onClear?.();
  }

  const hasValue = query !== "" || picked || !!selectedModel;
  const showDropdown = !picked && !selectedModel && models.length + products.length > 0;
  const flatItems: { kind: "model" | "product"; data: ModelResult | ProductResult }[] = [
    ...models.map((m) => ({ kind: "model" as const, data: m })),
    ...products.map((p) => ({ kind: "product" as const, data: p })),
  ];

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[highlightIndex];
      if (!item) return;
      if (item.kind === "model") selectModel(item.data as ModelResult);
      else pickProduct(item.data as ProductResult);
    }
  }

  return (
    // Owner UAT Fix Batch 1 — ข้อ 2: flex-wrap + min-w กันช่อง Size (w-40 คงที่) ไปบีบช่อง
    // ค้นหาจนเหลือพื้นที่ไม่พอ (ต้นเหตุ "Size dropdown ซ้อนอยู่ภายใน Product Search popup"
    // ที่เจอใน Tax Invoice เดิม — คอลัมน์ Grid แคบเกินไปสำหรับ flex ไม่ wrap) — ถ้าพื้นที่ไม่
    // พอจริงๆ ช่อง Size จะตกไปบรรทัดใหม่แทนที่จะบีบซ้อนทับกัน
    <div className="flex flex-wrap gap-2">
      <div className="relative flex-1 min-w-[160px]">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(false);
            setSelectedModel(null);
            onUnresolvedSize?.(null);
            onModelSelected?.(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          className={`w-full border rounded px-3 py-1.5 text-sm ${hasValue ? "pr-7" : ""}`}
        />
        {hasValue && (
          <button
            type="button"
            onClick={clear}
            tabIndex={-1}
            aria-label="ล้างการค้นหา"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-base leading-none w-5 h-5 flex items-center justify-center"
          >
            ×
          </button>
        )}
        {showDropdown && (
          <ul className="absolute z-10 w-full bg-white border rounded mt-1 shadow-lg max-h-56 overflow-auto">
            {models.map((m, i) => (
              <li
                key={m.modelId}
                onMouseDown={() => selectModel(m)}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`px-3 py-1.5 text-sm cursor-pointer flex justify-between items-center ${
                  i === highlightIndex ? "bg-blue-50" : "hover:bg-blue-50"
                }`}
              >
                <span>
                  รุ่น: <b>{m.modelName}</b>
                </span>
                <span className="text-gray-400 text-xs">
                  ({m.productTypeName}) {m.sizes.length} ไซส์
                </span>
              </li>
            ))}
            {products.map((p, i) => {
              const idx = models.length + i;
              return (
                <li
                  key={p.id}
                  onMouseDown={() => pickProduct(p)}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  className={`px-3 py-1.5 text-sm cursor-pointer ${
                    idx === highlightIndex ? "bg-blue-50" : "hover:bg-blue-50"
                  }`}
                >
                  <span className="font-mono">{p.sku}</span> — {p.name}
                  <span className="text-gray-400 ml-2 text-xs">({p.productTypeName})</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
