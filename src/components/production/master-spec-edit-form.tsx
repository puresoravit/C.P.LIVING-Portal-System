"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { stripUnitToNumber, formatWaddingWeight, formatFoamThickness } from "@/lib/fabric-unit-format";

// Master Spec edit (2026-08-29) — แก้ผ้า/โครงสร้าง/ลำดับ/printVisible/displayOverride +
// ผูก Product/ProductModel — key identity (specName/variant/thickness/gussetCount) แก้ไม่ได้
// ที่นี่ (แสดง read-only ที่หน้า) — ลำดับชั้นโครงสร้าง = physical order บนลงล่าง เลื่อนด้วยปุ่ม
// ขึ้น/ลง ส่วนผ้า: ลำดับในลิสต์ = ลำดับเก็บภายใน placement เดียวกัน (assignFabricSeq ฝั่ง server)

const PLACEMENT_SUGGESTIONS = ["WHOLE", "TOP", "BOTTOM", "SIDE", "HEAD_TAIL", "WING"];

export type MasterSpecHeadOption = { value: string; label: string };

export type MasterSpecEditInitial = {
  head: string; // "model:<id>" | "product:<id>" | ""
  note: string;
  approxThickness: string;
  fabrics: {
    placement: string;
    fabricName: string;
    fabricCode: string;
    waddingWeight: string;
    foamThickness: string;
    colorNote: string;
    displayOverride: string;
    printVisible: boolean;
  }[];
  layers: { material: string; spec: string; displayOverride: string; printVisible: boolean }[];
};

type FabricDraft = MasterSpecEditInitial["fabrics"][number] & { key: number };
type LayerDraft = MasterSpecEditInitial["layers"][number] & { key: number };

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return keySeq;
}

function moveItem<T>(arr: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function MasterSpecEditForm({
  initial,
  headOptions,
  action,
}: {
  initial: MasterSpecEditInitial;
  headOptions: MasterSpecHeadOption[];
  action: (formData: FormData) => Promise<ActionResult | void>;
}) {
  const [head, setHead] = useState(initial.head);
  const [note, setNote] = useState(initial.note);
  const [approxThickness, setApproxThickness] = useState(initial.approxThickness);
  // S6 UAT — ช่องนี้ตอนนี้เก็บแค่ตัวเลข (ไม่มีหน่วย) ในฟอร์ม — ค่าเดิมที่เคยพิมพ์หน่วยติดมา
  // (เช่น "280g"/"10mm") ต้อง strip หน่วยออกก่อนใส่กลับเข้าช่อง
  const [fabrics, setFabrics] = useState<FabricDraft[]>(() =>
    initial.fabrics.map((f) => ({ ...f, waddingWeight: stripUnitToNumber(f.waddingWeight), foamThickness: stripUnitToNumber(f.foamThickness), key: nextKey() }))
  );
  const [layers, setLayers] = useState<LayerDraft[]>(() => initial.layers.map((l) => ({ ...l, key: nextKey() })));
  const [err, setErr] = useState("");
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);
  const { showError } = useToast();

  if (thrownError) throw thrownError;

  function updateFabric(key: number, patch: Partial<FabricDraft>) {
    setFabrics((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }
  function updateLayer(key: number, patch: Partial<LayerDraft>) {
    setLayers((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    if (fabrics.length === 0 || fabrics.some((f) => !f.placement.trim() || !f.fabricName.trim())) {
      setErr("กรุณากรอกตำแหน่งและชื่อผ้าให้ครบทุกแถว (อย่างน้อย 1 แถว)");
      return;
    }
    if (layers.length === 0 || layers.some((l) => !l.material.trim() || !l.spec.trim())) {
      setErr("กรุณากรอกวัสดุและรายละเอียดโครงสร้างให้ครบทุกชั้น (อย่างน้อย 1 ชั้น)");
      return;
    }
    setErr("");

    const formData = new FormData();
    formData.set("head", head);
    formData.set("note", note);
    formData.set("approxThickness", approxThickness);
    formData.set(
      "fabricsJson",
      JSON.stringify(
        fabrics.map((f) => ({
          placement: f.placement.trim(),
          fabricName: f.fabricName.trim(),
          fabricCode: f.fabricCode || undefined,
          // ช่องเก็บแค่ตัวเลข เติมหน่วยกลับตอน submit เท่านั้น (g ติดกับตัวเลข, mm เว้นวรรค)
          waddingWeight: formatWaddingWeight(f.waddingWeight) || undefined,
          foamThickness: formatFoamThickness(f.foamThickness) || undefined,
          colorNote: f.colorNote || undefined,
          displayOverride: f.displayOverride || undefined,
          printVisible: f.printVisible,
        }))
      )
    );
    formData.set(
      "layersJson",
      JSON.stringify(
        layers.map((l) => ({
          material: l.material.trim(),
          spec: l.spec.trim(),
          displayOverride: l.displayOverride || undefined,
          printVisible: l.printVisible,
        }))
      )
    );

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <datalist id="master-placement-suggestions">
        {PLACEMENT_SUGGESTIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ผูกกับสินค้า/รุ่น (Family Head)</label>
          <select value={head} onChange={(e) => setHead(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
            <option value="">— ยังไม่ผูกสินค้า —</option>
            {headOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">ผูกได้เฉพาะรุ่นสินค้า (ProductModel) หรือสินค้าหัวตระกูล — ไม่มีการสร้างสินค้าใหม่จากหน้านี้</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ความหนาประมาณ (อ้างอิง)</label>
          <input value={approxThickness} onChange={(e) => setApproxThickness(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <span className="text-sm font-medium text-gray-700">ผ้า ({fabrics.length})</span>
        <div className="space-y-2 mt-2">
          {fabrics.map((f, idx) => (
            <div key={f.key} className={`border rounded-lg p-2 space-y-1.5 ${f.printVisible ? "bg-white" : "bg-gray-50"}`}>
              <div className="flex items-center gap-1.5">
                <div className="flex flex-col shrink-0">
                  <button type="button" onClick={() => setFabrics((prev) => moveItem(prev, idx, -1))} disabled={idx === 0} className="text-gray-400 hover:text-cp-navy disabled:opacity-20 text-xs leading-none">▲</button>
                  <button type="button" onClick={() => setFabrics((prev) => moveItem(prev, idx, 1))} disabled={idx === fabrics.length - 1} className="text-gray-400 hover:text-cp-navy disabled:opacity-20 text-xs leading-none">▼</button>
                </div>
                <input
                  list="master-placement-suggestions"
                  value={f.placement}
                  onChange={(e) => updateFabric(f.key, { placement: e.target.value })}
                  placeholder="ตำแหน่ง *"
                  className="w-28 shrink-0 border rounded px-2 py-1.5 text-sm"
                />
                <input value={f.fabricName} onChange={(e) => updateFabric(f.key, { fabricName: e.target.value })} placeholder="ชื่อผ้า *" className="flex-1 border rounded px-2 py-1.5 text-sm" />
                {fabrics.length > 1 && (
                  <button type="button" onClick={() => setFabrics((prev) => prev.filter((x) => x.key !== f.key))} className="text-gray-400 hover:text-red-600 text-sm px-1">
                    ×
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <input value={f.fabricCode} onChange={(e) => updateFabric(f.key, { fabricCode: e.target.value })} placeholder="รหัสผ้า" className="border rounded px-2 py-1.5 text-sm" />
                {/* S6 UAT — พิมพ์แค่ตัวเลข ระบบเติมหน่วยให้เอง (g ติดกับตัวเลข, mm เว้นวรรค) */}
                <div className="relative">
                  <input
                    value={f.waddingWeight}
                    onChange={(e) => updateFabric(f.key, { waddingWeight: e.target.value })}
                    placeholder="ใย (ตัวเลข) เช่น 280"
                    inputMode="decimal"
                    className="w-full border rounded pl-2 pr-6 py-1.5 text-sm"
                  />
                  {f.waddingWeight && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">g</span>}
                </div>
                <div className="relative">
                  <input
                    value={f.foamThickness}
                    onChange={(e) => updateFabric(f.key, { foamThickness: e.target.value })}
                    placeholder="ฟ. (ตัวเลข) เช่น 10"
                    inputMode="decimal"
                    className="w-full border rounded pl-2 pr-8 py-1.5 text-sm"
                  />
                  {f.foamThickness && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">mm</span>}
                </div>
                {/* สีปกติระบุไว้ในชื่อผ้าอยู่แล้ว — ช่องนี้เป็นแค่หมายเหตุเสริม เผื่อกรณีพิเศษ */}
                <input value={f.colorNote} onChange={(e) => updateFabric(f.key, { colorNote: e.target.value })} placeholder="หมายเหตุผ้าเพิ่มเติม (ถ้ามี)" className="border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-3">
                <input
                  value={f.displayOverride}
                  onChange={(e) => updateFabric(f.key, { displayOverride: e.target.value })}
                  placeholder="ข้อความแสดงบนใบพิมพ์ (override — เว้นว่าง = ใช้ข้อมูลจริง)"
                  className="flex-1 border rounded px-2 py-1.5 text-sm"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-600 shrink-0">
                  <input type="checkbox" checked={f.printVisible} onChange={(e) => updateFabric(f.key, { printVisible: e.target.checked })} className="rounded" />
                  แสดงบนใบสั่งผลิต
                </label>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setFabrics((prev) => [...prev, { key: nextKey(), placement: "", fabricName: "", fabricCode: "", waddingWeight: "", foamThickness: "", colorNote: "", displayOverride: "", printVisible: true }])} className="mt-1.5 text-xs text-cp-navy hover:underline">
          + เพิ่มผ้า
        </button>
      </div>

      <div>
        <span className="text-sm font-medium text-gray-700">โครงสร้าง (เรียงจากบนลงล่าง — ลำดับมีผลต่อสูตรจริง) ({layers.length})</span>
        <div className="space-y-1.5 mt-2">
          {layers.map((l, idx) => (
            <div key={l.key} className={`border rounded-lg p-2 space-y-1.5 ${l.printVisible ? "bg-white" : "bg-gray-50"}`}>
              <div className="flex items-center gap-1.5">
                <div className="flex flex-col shrink-0">
                  <button type="button" onClick={() => setLayers((prev) => moveItem(prev, idx, -1))} disabled={idx === 0} className="text-gray-400 hover:text-cp-navy disabled:opacity-20 text-xs leading-none">▲</button>
                  <button type="button" onClick={() => setLayers((prev) => moveItem(prev, idx, 1))} disabled={idx === layers.length - 1} className="text-gray-400 hover:text-cp-navy disabled:opacity-20 text-xs leading-none">▼</button>
                </div>
                <span className="text-xs text-gray-400 w-4 shrink-0">{idx + 1}.</span>
                <input value={l.material} onChange={(e) => updateLayer(l.key, { material: e.target.value })} placeholder="วัสดุ *" className="flex-1 border rounded px-2 py-1.5 text-sm" />
                <input value={l.spec} onChange={(e) => updateLayer(l.key, { spec: e.target.value })} placeholder="รายละเอียด *" className="flex-1 border rounded px-2 py-1.5 text-sm" />
                {layers.length > 1 && (
                  <button type="button" onClick={() => setLayers((prev) => prev.filter((x) => x.key !== l.key))} className="text-gray-400 hover:text-red-600 text-sm px-1">
                    ×
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 pl-9">
                <input
                  value={l.displayOverride}
                  onChange={(e) => updateLayer(l.key, { displayOverride: e.target.value })}
                  placeholder="ข้อความแสดงบนใบพิมพ์ (override)"
                  className="flex-1 border rounded px-2 py-1.5 text-sm"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-600 shrink-0">
                  <input type="checkbox" checked={l.printVisible} onChange={(e) => updateLayer(l.key, { printVisible: e.target.checked })} className="rounded" />
                  แสดงบนใบสั่งผลิต
                </label>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLayers((prev) => [...prev, { key: nextKey(), material: "", spec: "", displayOverride: "", printVisible: true }])} className="mt-1.5 text-xs text-cp-navy hover:underline">
          + เพิ่มชั้น
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-cp-navy hover:bg-cp-navy-light disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-3"
      >
        {isPending ? "กำลังบันทึก..." : "บันทึกสูตร Master"}
      </button>
      <p className="text-xs text-gray-400 text-center">
        การแก้สูตรนี้ไม่กระทบใบสั่งผลิตที่ Confirm ไปแล้ว (ใบเหล่านั้นเก็บ snapshot ของตัวเองอิสระ) — ทุกการแก้ถูกบันทึกประวัติเต็มใน Audit Log
      </p>
    </form>
  );
}
