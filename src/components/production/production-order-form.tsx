"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// S3 CP1 — ฟอร์มสร้าง ProductionOrder จาก CustomerPO ที่เลือกอยู่แล้ว (entry point เดียว
// คือปุ่ม "สร้างใบสั่งผลิต" บนหน้า detail ของ CustomerPO) mobile-first เหมือน
// customer-po-form.tsx: การ์ดต่อ CustomerPOLine ที่ยังไม่ resolve ไม่แสดงในนี้เลย (ต้องไป
// ผูกสินค้าที่หน้าแก้ไข P.O. ก่อน — ดู eligibleLines ที่ Server Component กรองมาให้แล้ว)
//
// placement เป็นช่องพิมพ์อิสระ (มี <datalist> แนะนำ WHOLE/TOP/BOTTOM/SIDE/HEAD_TAIL ให้พิมพ์
// ง่ายขึ้นเท่านั้น ไม่ใช่ตัวเลือกปิดตายตัว) — ตรงกับ decision ว่า placement ไม่ทำ enum

// WING ยืนยันเป็นคนละ placement จาก SIDE จริง (ข้อมูล Cerina มีทั้งคู่พร้อมกัน 2026-08-28) —
// รายการนี้เป็นแค่ตัวช่วยพิมพ์ ไม่ใช่ตัวเลือกปิดตายตัว (placement ยังพิมพ์อิสระได้เสมอ)
const PLACEMENT_SUGGESTIONS = ["WHOLE", "TOP", "BOTTOM", "SIDE", "HEAD_TAIL", "WING"];

export type EligibleLine = {
  id: string;
  productLabel: string;
  sku: string | null;
  size: string | null;
  qtyCurrent: number;
};

type FabricDraft = { key: number; placement: string; fabricName: string; fabricCode: string; waddingWeight: string; foamThickness: string; colorNote: string };
type LayerDraft = { key: number; material: string; spec: string };

type ItemDraft = {
  lineId: string;
  selected: boolean;
  qty: string;
  gussetCount: string;
  thickness: string;
  note: string;
  fabrics: FabricDraft[];
  layers: LayerDraft[];
};

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return keySeq;
}

function emptyFabric(): FabricDraft {
  return { key: nextKey(), placement: "", fabricName: "", fabricCode: "", waddingWeight: "", foamThickness: "", colorNote: "" };
}

function emptyLayer(): LayerDraft {
  return { key: nextKey(), material: "", spec: "" };
}

// S3 CP3 — ข้อมูลตั้งต้นตอนออก Revision ใหม่ (Server Component ประกอบมาจาก Revision ปัจจุบัน
// แล้ว) baseRevNo ใช้คู่กับ Optimistic Lock (compare-and-swap บน ProductionOrder.currentRevNo
// — Pattern เดียวกับ CustomerPO.version) ไม่ให้มา = โหมดสร้างใหม่ (CP1 เดิม)
export type ProductionOrderFormInitial = {
  baseRevNo: number;
  items: {
    customerPoLineId: string;
    qty: number;
    gussetCount: number | null;
    thickness: string | null;
    note: string | null;
    fabrics: { placement: string; fabricName: string; fabricCode: string | null; waddingWeight: string | null; foamThickness: string | null; colorNote: string | null }[];
    layers: { material: string; spec: string }[];
  }[];
};

function initialItemDraft(lineId: string, qtyCurrent: number, initial?: ProductionOrderFormInitial["items"][number]): ItemDraft {
  if (!initial) {
    return { lineId, selected: false, qty: String(qtyCurrent), gussetCount: "", thickness: "", note: "", fabrics: [], layers: [] };
  }
  return {
    lineId,
    selected: true,
    qty: String(initial.qty),
    gussetCount: initial.gussetCount != null ? String(initial.gussetCount) : "",
    thickness: initial.thickness ?? "",
    note: initial.note ?? "",
    fabrics: initial.fabrics.map((f) => ({
      key: nextKey(),
      placement: f.placement,
      fabricName: f.fabricName,
      fabricCode: f.fabricCode ?? "",
      waddingWeight: f.waddingWeight ?? "",
      foamThickness: f.foamThickness ?? "",
      colorNote: f.colorNote ?? "",
    })),
    layers: initial.layers.map((l) => ({ key: nextKey(), material: l.material, spec: l.spec })),
  };
}

export function ProductionOrderForm({
  eligibleLines,
  maxGussetCount,
  maxFabricsPerPlacement,
  action,
  initial,
}: {
  eligibleLines: EligibleLine[];
  maxGussetCount: number;
  maxFabricsPerPlacement: Record<string, number>;
  action: (formData: FormData) => Promise<ActionResult | void>;
  /** ให้มา = โหมดออก Revision ใหม่ (มีช่องเหตุผล + ส่ง baseRevNo ไปด้วยสำหรับ Optimistic
   * Lock) — ไม่ให้มา = โหมดสร้างใหม่ (CP1) */
  initial?: ProductionOrderFormInitial;
}) {
  const isRevise = !!initial;
  const [items, setItems] = useState<Record<string, ItemDraft>>(() =>
    Object.fromEntries(
      eligibleLines.map((l) => {
        const initialItem = initial?.items.find((i) => i.customerPoLineId === l.id);
        return [l.id, initialItemDraft(l.id, l.qtyCurrent, initialItem)];
      })
    )
  );
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [invalidLineIds, setInvalidLineIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);
  const { showError } = useToast();

  if (thrownError) throw thrownError;

  function patchItem(lineId: string, patch: Partial<ItemDraft>) {
    setItems((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));
    setInvalidLineIds((prev) => {
      if (!prev.has(lineId)) return prev;
      const next = new Set(prev);
      next.delete(lineId);
      return next;
    });
  }

  function toggleSelected(lineId: string, selected: boolean) {
    patchItem(lineId, selected ? { selected, fabrics: items[lineId].fabrics.length ? items[lineId].fabrics : [emptyFabric()], layers: items[lineId].layers.length ? items[lineId].layers : [emptyLayer()] } : { selected });
  }

  function addFabric(lineId: string) {
    patchItem(lineId, { fabrics: [...items[lineId].fabrics, emptyFabric()] });
  }
  function removeFabric(lineId: string, key: number) {
    patchItem(lineId, { fabrics: items[lineId].fabrics.filter((f) => f.key !== key) });
  }
  function updateFabric(lineId: string, key: number, patch: Partial<FabricDraft>) {
    patchItem(lineId, { fabrics: items[lineId].fabrics.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  }

  function addLayer(lineId: string) {
    patchItem(lineId, { layers: [...items[lineId].layers, emptyLayer()] });
  }
  function removeLayer(lineId: string, key: number) {
    patchItem(lineId, { layers: items[lineId].layers.filter((l) => l.key !== key) });
  }
  function updateLayer(lineId: string, key: number, patch: Partial<LayerDraft>) {
    patchItem(lineId, { layers: items[lineId].layers.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  }

  function findInvalid(): { invalidIds: Set<string>; message: string } | null {
    const selected = Object.values(items).filter((i) => i.selected);
    if (selected.length === 0) return { invalidIds: new Set(), message: "กรุณาเลือกอย่างน้อย 1 รายการ" };
    if (isRevise && !reason.trim()) return { invalidIds: new Set(), message: "กรุณากรอกเหตุผลที่ออก Revision ใหม่" };

    const invalidIds = new Set<string>();
    for (const item of selected) {
      const qty = Number(item.qty);
      const qtyInvalid = !Number.isFinite(qty) || qty <= 0;
      const gussetInvalid = item.gussetCount !== "" && (!Number.isInteger(Number(item.gussetCount)) || Number(item.gussetCount) <= 0 || Number(item.gussetCount) > maxGussetCount);
      const fabricsInvalid = item.fabrics.length === 0 || item.fabrics.some((f) => !f.placement.trim() || !f.fabricName.trim());
      const layersInvalid = item.layers.length === 0 || item.layers.some((l) => !l.material.trim() || !l.spec.trim());

      const countByPlacement = new Map<string, number>();
      for (const f of item.fabrics) {
        const p = f.placement.trim();
        if (p) countByPlacement.set(p, (countByPlacement.get(p) ?? 0) + 1);
      }
      const placementCapExceeded = [...countByPlacement.entries()].some(([placement, count]) => count > (maxFabricsPerPlacement[placement] ?? 1));

      if (qtyInvalid || gussetInvalid || fabricsInvalid || layersInvalid || placementCapExceeded) invalidIds.add(item.lineId);
    }
    if (invalidIds.size === 0) return null;
    return { invalidIds, message: `กรุณาแก้ไข ${invalidIds.size} รายการที่ไฮไลต์กรอบแดงด้านล่าง (จำนวน/กุ๊น/ผ้า/โครงสร้างยังไม่ครบหรือไม่ถูกต้อง)` };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    const invalid = findInvalid();
    if (invalid) {
      setErr(invalid.message);
      setInvalidLineIds(invalid.invalidIds);
      return;
    }
    setErr("");
    setInvalidLineIds(new Set());

    const selected = Object.values(items).filter((i) => i.selected);
    const formData = new FormData();
    formData.set(
      "itemsJson",
      JSON.stringify(
        selected.map((item) => ({
          customerPoLineId: item.lineId,
          qty: Number(item.qty),
          gussetCount: item.gussetCount ? Number(item.gussetCount) : undefined,
          thickness: item.thickness || undefined,
          note: item.note || undefined,
          fabrics: item.fabrics.map((f) => ({
            placement: f.placement.trim(),
            fabricName: f.fabricName.trim(),
            fabricCode: f.fabricCode || undefined,
            waddingWeight: f.waddingWeight || undefined,
            foamThickness: f.foamThickness || undefined,
            colorNote: f.colorNote || undefined,
          })),
          layers: item.layers.map((l) => ({ material: l.material.trim(), spec: l.spec.trim() })),
        }))
      )
    );
    if (isRevise) {
      formData.set("baseRevNo", String(initial!.baseRevNo));
      formData.set("reason", reason);
    }

    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result && !result.success) showError(result.error);
      } catch (error) {
        unstable_rethrow(error);
        setThrownError(error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <datalist id="fabric-placement-suggestions">
        {PLACEMENT_SUGGESTIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {eligibleLines.map((line) => {
        const item = items[line.id];
        const isInvalid = invalidLineIds.has(line.id);
        return (
          <div key={line.id} className={`bg-white border rounded-lg p-3 space-y-3 ${isInvalid ? "border-red-400 bg-red-50/40" : ""}`}>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={item.selected} onChange={(e) => toggleSelected(line.id, e.target.checked)} className="rounded mt-0.5" />
              <div>
                <div className="text-sm font-medium">
                  {line.productLabel}
                  {line.size && <span className="text-gray-500"> (ไซส์ {line.size})</span>}
                </div>
                {line.sku && <div className="text-xs text-gray-400 font-mono">{line.sku}</div>}
                <div className="text-xs text-gray-500">สั่งไว้ {line.qtyCurrent} ชิ้น</div>
              </div>
            </label>

            {item.selected && (
              <div className="pl-6 space-y-3 border-l-2 border-gray-100">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">จำนวนที่ผลิต *</label>
                    <input type="number" min="1" step="1" value={item.qty} onChange={(e) => patchItem(line.id, { qty: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">กุ๊น (ถ้ามี)</label>
                    <input type="number" min="1" max={maxGussetCount} step="1" value={item.gussetCount} onChange={(e) => patchItem(line.id, { gussetCount: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" placeholder={`สูงสุด ${maxGussetCount}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">ความหนา (ถ้ามี)</label>
                    <input value={item.thickness} onChange={(e) => patchItem(line.id, { thickness: e.target.value })} placeholder='เช่น "8"' className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">ผ้า *</span>
                  </div>
                  <div className="space-y-2">
                    {item.fabrics.map((f) => (
                      <div key={f.key} className="bg-gray-50 border rounded p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            list="fabric-placement-suggestions"
                            value={f.placement}
                            onChange={(e) => updateFabric(line.id, f.key, { placement: e.target.value })}
                            placeholder="ตำแหน่ง เช่น TOP"
                            className="w-28 shrink-0 border rounded px-2 py-1.5 text-sm"
                          />
                          <input
                            value={f.fabricName}
                            onChange={(e) => updateFabric(line.id, f.key, { fabricName: e.target.value })}
                            placeholder="ชื่อผ้า *"
                            className="flex-1 border rounded px-2 py-1.5 text-sm"
                          />
                          {item.fabrics.length > 1 && (
                            <button type="button" onClick={() => removeFabric(line.id, f.key)} className="text-gray-400 hover:text-red-600 text-sm px-1">
                              ×
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          <input value={f.fabricCode} onChange={(e) => updateFabric(line.id, f.key, { fabricCode: e.target.value })} placeholder="รหัสผ้า" className="border rounded px-2 py-1.5 text-sm" />
                          <input value={f.waddingWeight} onChange={(e) => updateFabric(line.id, f.key, { waddingWeight: e.target.value })} placeholder="ใย เช่น 280g" className="border rounded px-2 py-1.5 text-sm" />
                          <input value={f.foamThickness} onChange={(e) => updateFabric(line.id, f.key, { foamThickness: e.target.value })} placeholder="ฟ. เช่น 10mm" className="border rounded px-2 py-1.5 text-sm" />
                          <input value={f.colorNote} onChange={(e) => updateFabric(line.id, f.key, { colorNote: e.target.value })} placeholder="สี/หมายเหตุผ้า" className="border rounded px-2 py-1.5 text-sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => addFabric(line.id)} className="mt-1.5 text-xs text-cp-navy hover:underline">
                    + เพิ่มผ้า
                  </button>
                </div>

                <div>
                  <span className="text-xs font-medium text-gray-600">โครงสร้าง (เรียงจากบนลงล่าง) *</span>
                  <div className="space-y-1.5 mt-1">
                    {item.layers.map((l, idx) => (
                      <div key={l.key} className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 w-4 shrink-0">{idx + 1}.</span>
                        <input value={l.material} onChange={(e) => updateLayer(line.id, l.key, { material: e.target.value })} placeholder="วัสดุ *" className="flex-1 border rounded px-2 py-1.5 text-sm" />
                        <input value={l.spec} onChange={(e) => updateLayer(line.id, l.key, { spec: e.target.value })} placeholder="รายละเอียด *" className="flex-1 border rounded px-2 py-1.5 text-sm" />
                        {item.layers.length > 1 && (
                          <button type="button" onClick={() => removeLayer(line.id, l.key)} className="text-gray-400 hover:text-red-600 text-sm px-1">
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => addLayer(line.id)} className="mt-1.5 text-xs text-cp-navy hover:underline">
                    + เพิ่มชั้น
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
                  <input value={item.note} onChange={(e) => patchItem(line.id, { note: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {isRevise && (
        <div className="bg-white border rounded-lg p-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">เหตุผลที่ออก Revision ใหม่ *</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ลูกค้าเปลี่ยนผ้า, แก้จำนวนกุ๊น"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            Revision เดิม (Rev.{initial!.baseRevNo}) จะยังอยู่ครบ ดูย้อนหลังได้เสมอ — บันทึกนี้จะกลายเป็น Rev.{initial!.baseRevNo + 1}
          </p>
        </div>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-cp-navy hover:bg-cp-navy-light disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-3"
      >
        {isPending ? "กำลังบันทึก..." : isRevise ? "ออก Revision ใหม่" : "ยืนยัน/ออกใบสั่งผลิต (Confirm/Issue)"}
      </button>
    </form>
  );
}
