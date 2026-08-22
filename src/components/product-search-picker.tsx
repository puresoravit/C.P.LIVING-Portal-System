"use client";

import { useState, useEffect } from "react";

// R4 — Size Architecture Path A: "ค้นหารุ่นสินค้า → เลือก Size" (Model ก่อน แล้วเลือก
// Size จาก Size ที่มีอยู่จริงของรุ่นนั้นเท่านั้น) — Resolve ไปหา Product/SKU/ราคาจริง
// ด้านหลังให้อัตโนมัติ ไม่ให้ User ต้องพิมพ์/จำ SKU ที่มี Size ต่อท้ายเอง — สินค้าที่ไม่มี
// Model (Standalone เช่น หมอน/Accessory) ยังค้นหา/เลือกตรงๆ ได้เหมือนเดิมทุกประการ
// ไม่บังคับผ่าน Size
//
// Phase E-UX — เปลี่ยนจาก "เลือก Model แล้ว Dropdown เดิมเปลี่ยนไปโชว์รายการ Size แทน"
// (ของเดิม สับสนเพราะดูเหมือน Search ผลลัพธ์เปลี่ยนหน้า) เป็น "ช่อง Size แยกต่างหาก
// ที่ปรากฏขึ้นข้างๆ ช่องค้นหา หลังเลือก Model แล้ว" ตามที่อนุมัติ — ยังคง Resolve ไปหา
// Product Variant จริงเบื้องหลังทุกประการ ไม่มี Pricing Path ใหม่ ไม่มี Query ใหม่
// (Model Result จาก /api/products/search เดิมมี sizes[] มาให้ครบอยู่แล้วตั้งแต่ R4)
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
};

type ModelSizeOption = {
  productId: string | null;
  sku: string | null;
  unit: string;
  size: string;
  label: string;
  resolved: boolean;
  custom: boolean;
};
type ModelResult = { modelId: string; modelName: string; productTypeName: string; usesSize: boolean; sizes: ModelSizeOption[] };
type ProductResult = { id: string; sku: string; name: string; unit: string; productTypeName: string };

function sizeOptionToPicked(model: ModelResult, s: ModelSizeOption): PickedProduct {
  const name = s.size ? `${model.modelName} ${s.size}` : model.modelName;
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
  const anchor = model.sizes.find((x) => x.resolved)?.productId ?? null;
  return {
    modelId: model.modelId,
    modelName: model.modelName,
    productTypeName: model.productTypeName,
    unit: s.unit,
    size: s.custom ? "" : s.label,
    custom: s.custom,
    anchorProductId: anchor,
  };
}

export function ProductSearchPicker({
  onPick,
  onUnresolvedSize,
  onClear,
  autoFocus,
  placeholder = "เช่น GT-David หรือ M001",
  resetToken,
}: {
  onPick: (p: PickedProduct) => void;
  /** R6 Phase B — เรียกเมื่อเลือก Size ที่ยังไม่มี Product จริงรองรับ (Standard ที่ยังไม่ตั้งราคา หรือขนาดพิเศษ) — ไม่ implement = พฤติกรรมเดิม (ตัวเลือกนั้นจะเลือกไม่ได้จริง เพราะไม่มี onPick ให้เรียก) */
  onUnresolvedSize?: (info: UnresolvedSizeInfo | null) => void;
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
  // Model ที่เลือกไว้ (รอเลือก Size ต่อ) — ต่างจาก activeModel เดิมที่ใช้ Drill-down
  // ภายใน Dropdown เดียวกัน ตัวนี้ทำให้ Dropdown ค้นหาปิดไปเลย แล้วโชว์ช่อง Size แยก
  const [selectedModel, setSelectedModel] = useState<ModelResult | null>(null);
  const [selectedSizeIdx, setSelectedSizeIdx] = useState("");
  // ข้อ 60: รองรับเลือกด้วยลูกศร/Enter เหมือนเดิม — ใช้กับรายการ Model/Product ในช่อง
  // ค้นหาเท่านั้น (Size เป็น <select> เดิมของ Browser มี Keyboard Nav ของตัวเองอยู่แล้ว)
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    setQuery("");
    setModels([]);
    setProducts([]);
    setPicked(false);
    setSelectedModel(null);
    setSelectedSizeIdx("");
    setHighlightIndex(0);
    onUnresolvedSize?.(null);
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
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
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
  }, [query, selectedModel, picked]);

  function pickProduct(p: ProductResult) {
    setQuery(`${p.sku} — ${p.name}`);
    setPicked(true);
    setModels([]);
    setProducts([]);
    setSelectedModel(null);
    setSelectedSizeIdx("");
    onUnresolvedSize?.(null);
    onPick(p);
  }

  // เลือก Model จาก Dropdown ค้นหา — ปิด Dropdown ค้นหาทันที (ไม่ใช่ Drill-down ต่อใน
  // Dropdown เดิม) แล้วโชว์ช่อง Size แยก — ถ้า Model มี Size ตัวเลือกเดียวและ Resolve ได้
  // จริง ให้อัตโนมัติเลย (ไม่บังคับเลือกจากตัวเลือกเดียวที่ไม่มีความหมาย)
  function selectModel(m: ModelResult) {
    setQuery(`รุ่น: ${m.modelName}`);
    setModels([]);
    setProducts([]);
    setSelectedModel(m);
    onUnresolvedSize?.(null);
    if (m.sizes.length === 1 && m.sizes[0].resolved) {
      setSelectedSizeIdx("0");
      setPicked(true);
      onPick(sizeOptionToPicked(m, m.sizes[0]));
    } else {
      setSelectedSizeIdx("");
      setPicked(false);
    }
  }

  function handleSizeChange(idxStr: string) {
    setSelectedSizeIdx(idxStr);
    if (!selectedModel) return;
    const s = selectedModel.sizes[Number(idxStr)];
    if (!s) {
      setPicked(false);
      onUnresolvedSize?.(null);
      return;
    }
    if (s.resolved) {
      setPicked(true);
      onUnresolvedSize?.(null);
      onPick(sizeOptionToPicked(selectedModel, s));
    } else {
      setPicked(false);
      onUnresolvedSize?.(sizeOptionToUnresolved(selectedModel, s));
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
    setSelectedSizeIdx("");
    setHighlightIndex(0);
    onUnresolvedSize?.(null);
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
            setSelectedSizeIdx("");
            onUnresolvedSize?.(null);
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

      {selectedModel && (
        <div className="w-40 shrink-0">
          <select
            value={selectedSizeIdx}
            onChange={(e) => handleSizeChange(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              — ขนาด —
            </option>
            {selectedModel.sizes.map((s, i) => (
              <option key={i} value={i}>
                {s.label}
                {!s.resolved && !s.custom ? " (ยังไม่มีในระบบ)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
