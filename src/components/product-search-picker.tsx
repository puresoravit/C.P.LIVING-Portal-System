"use client";

import { useState, useEffect } from "react";

// R4 — Size Architecture Path A: แทนที่ Search SKU/ชื่อสินค้าตรงๆ แบบเดิม ด้วย
// "ค้นหารุ่นสินค้า → เลือก Size" (Model ก่อน แล้วเลือก Size จาก Size ที่มีอยู่จริงของ
// รุ่นนั้นเท่านั้น) — Resolve ไปหา Product/SKU/ราคาจริงด้านหลังให้อัตโนมัติ ไม่ให้ User
// ต้องพิมพ์/จำ SKU ที่มี Size ต่อท้ายเอง — สินค้าที่ไม่มี Model (Standalone เช่น
// หมอน/Accessory) ยังค้นหา/เลือกตรงๆ ได้เหมือนเดิมทุกประการ ไม่บังคับผ่าน Size
export type PickedProduct = { id: string; sku: string; name: string; unit: string; productTypeName: string };

type ModelSizeOption = { productId: string; sku: string; unit: string; size: string | null; label: string };
type ModelResult = { modelId: string; modelName: string; productTypeName: string; sizes: ModelSizeOption[] };
type ProductResult = { id: string; sku: string; name: string; unit: string; productTypeName: string };

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
  const [activeModel, setActiveModel] = useState<ModelResult | null>(null);
  const [picked, setPicked] = useState(false);
  // ข้อ 60: รองรับเลือกด้วยลูกศร/Enter เหมือนเดิม — highlightIndex อ้างอิง flat list
  // ของรายการที่กำลังแสดงอยู่ ณ ขณะนั้น (Model+Product ระดับบนสุด หรือ Size ของ
  // activeModel เมื่อ Drill-down เข้าไปแล้ว)
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    setQuery("");
    setModels([]);
    setProducts([]);
    setActiveModel(null);
    setPicked(false);
    setHighlightIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useEffect(() => {
    if (!query || activeModel || picked) {
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
  }, [query, activeModel, picked]);

  function pickProduct(p: ProductResult) {
    setQuery(`${p.sku} — ${p.name}`);
    setPicked(true);
    setModels([]);
    setProducts([]);
    onPick(p);
  }

  function pickSize(model: ModelResult, s: ModelSizeOption) {
    const name = s.size ? `${model.modelName} ${s.size}` : model.modelName;
    setQuery(`${s.sku} — ${name}`);
    setPicked(true);
    setActiveModel(null);
    onPick({ id: s.productId, sku: s.sku, name, unit: s.unit, productTypeName: model.productTypeName });
  }

  function drillIntoModel(m: ModelResult) {
    setActiveModel(m);
    setHighlightIndex(0);
  }

  const showDropdown = !picked && (activeModel ? activeModel.sizes.length > 0 : models.length + products.length > 0);

  // flat list ของรายการที่แสดงอยู่ตอนนี้ ใช้ทั้งสำหรับ mouse hover sync และ keyboard nav
  const flatItems: { kind: "model" | "product" | "size"; data: ModelResult | ProductResult | ModelSizeOption }[] =
    activeModel
      ? activeModel.sizes.map((s) => ({ kind: "size" as const, data: s }))
      : [
          ...models.map((m) => ({ kind: "model" as const, data: m })),
          ...products.map((p) => ({ kind: "product" as const, data: p })),
        ];

  function selectItem(index: number) {
    const item = flatItems[index];
    if (!item) return;
    if (item.kind === "model") drillIntoModel(item.data as ModelResult);
    else if (item.kind === "product") pickProduct(item.data as ProductResult);
    else if (activeModel) pickSize(activeModel, item.data as ModelSizeOption);
  }

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
      selectItem(highlightIndex);
    } else if (e.key === "Escape" && activeModel) {
      e.preventDefault();
      setActiveModel(null);
      setHighlightIndex(0);
    }
  }

  let flatIdx = -1;

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPicked(false);
          setActiveModel(null);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className="w-full border rounded px-3 py-1.5 text-sm"
      />
      {showDropdown && (
        <ul className="absolute z-10 w-full bg-white border rounded mt-1 shadow-lg max-h-56 overflow-auto">
          {activeModel ? (
            <>
              <li className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 flex justify-between items-center sticky top-0">
                <span>{activeModel.modelName} — เลือกไซส์</span>
                <button
                  type="button"
                  onMouseDown={() => {
                    setActiveModel(null);
                    setHighlightIndex(0);
                  }}
                  className="text-blue-600 hover:underline"
                >
                  ← กลับ
                </button>
              </li>
              {activeModel.sizes.map((s) => {
                flatIdx++;
                const idx = flatIdx;
                return (
                  <li
                    key={s.productId}
                    onMouseDown={() => pickSize(activeModel, s)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`px-3 py-1.5 text-sm cursor-pointer ${
                      idx === highlightIndex ? "bg-blue-50" : "hover:bg-blue-50"
                    }`}
                  >
                    {s.label}
                  </li>
                );
              })}
            </>
          ) : (
            <>
              {models.map((m) => {
                flatIdx++;
                const idx = flatIdx;
                return (
                  <li
                    key={m.modelId}
                    onMouseDown={() => drillIntoModel(m)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`px-3 py-1.5 text-sm cursor-pointer flex justify-between items-center ${
                      idx === highlightIndex ? "bg-blue-50" : "hover:bg-blue-50"
                    }`}
                  >
                    <span>
                      รุ่น: <b>{m.modelName}</b>
                    </span>
                    <span className="text-gray-400 text-xs">
                      ({m.productTypeName}) {m.sizes.length} ไซส์ ▸
                    </span>
                  </li>
                );
              })}
              {products.map((p) => {
                flatIdx++;
                const idx = flatIdx;
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
            </>
          )}
        </ul>
      )}
    </div>
  );
}
