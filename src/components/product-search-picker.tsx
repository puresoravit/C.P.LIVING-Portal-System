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
export type PickedProduct = { id: string; sku: string; name: string; unit: string; productTypeName: string };

type ModelSizeOption = { productId: string; sku: string; unit: string; size: string | null; label: string };
type ModelResult = { modelId: string; modelName: string; productTypeName: string; sizes: ModelSizeOption[] };
type ProductResult = { id: string; sku: string; name: string; unit: string; productTypeName: string };

function sizeOptionToPicked(model: ModelResult, s: ModelSizeOption): PickedProduct {
  const name = s.size ? `${model.modelName} ${s.size}` : model.modelName;
  return { id: s.productId, sku: s.sku, name, unit: s.unit, productTypeName: model.productTypeName };
}

export function ProductSearchPicker({
  onPick,
  autoFocus,
  placeholder = "เช่น GT-David หรือ M001",
  resetToken,
}: {
  onPick: (p: PickedProduct) => void;
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
  const [selectedSizeProductId, setSelectedSizeProductId] = useState("");
  // ข้อ 60: รองรับเลือกด้วยลูกศร/Enter เหมือนเดิม — ใช้กับรายการ Model/Product ในช่อง
  // ค้นหาเท่านั้น (Size เป็น <select> เดิมของ Browser มี Keyboard Nav ของตัวเองอยู่แล้ว)
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    setQuery("");
    setModels([]);
    setProducts([]);
    setPicked(false);
    setSelectedModel(null);
    setSelectedSizeProductId("");
    setHighlightIndex(0);
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
    setSelectedSizeProductId("");
    onPick(p);
  }

  // เลือก Model จาก Dropdown ค้นหา — ปิด Dropdown ค้นหาทันที (ไม่ใช่ Drill-down ต่อใน
  // Dropdown เดิม) แล้วโชว์ช่อง Size แยก — ถ้า Model มี Size ตัวเลือกเดียว Resolve ให้
  // อัตโนมัติเลย (ไม่บังคับเลือกจากตัวเลือกเดียวที่ไม่มีความหมาย)
  function selectModel(m: ModelResult) {
    setQuery(`รุ่น: ${m.modelName}`);
    setModels([]);
    setProducts([]);
    setSelectedModel(m);
    if (m.sizes.length === 1) {
      const only = m.sizes[0];
      setSelectedSizeProductId(only.productId);
      setPicked(true);
      onPick(sizeOptionToPicked(m, only));
    } else {
      setSelectedSizeProductId("");
      setPicked(false);
    }
  }

  function handleSizeChange(productId: string) {
    setSelectedSizeProductId(productId);
    if (!selectedModel) return;
    const s = selectedModel.sizes.find((x) => x.productId === productId);
    if (!s) {
      setPicked(false);
      return;
    }
    setPicked(true);
    onPick(sizeOptionToPicked(selectedModel, s));
  }

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
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(false);
            setSelectedModel(null);
            setSelectedSizeProductId("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          className="w-full border rounded px-3 py-1.5 text-sm"
        />
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
        <div className="w-32 shrink-0">
          <select
            value={selectedSizeProductId}
            onChange={(e) => handleSizeChange(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              — ขนาด —
            </option>
            {selectedModel.sizes.map((s) => (
              <option key={s.productId} value={s.productId}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
