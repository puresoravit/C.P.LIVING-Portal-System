"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import { reconcileLoadingTrip, correctLoadingLineQty, addAdhocLine, removeAdhocLine } from "@/app/production/loading/actions";

// CP3 — ฟอร์มกระทบยอด (ภาษาหน้างาน): ต่อรายการเห็น "ขึ้นจริง N → ตัดจากไหน → เหลืออะไร"
// prefill จากบริบทแผน (FRESH→ออเดอร์ใหม่เท่า capacity, OUTSTANDING→บัตรที่วางแผนไว้) แต่คน
// แก้ได้ทุกอย่าง — ไม่มี FIFO — validate client เพื่อ UX, server ตัดสินจริงเสมอ

export type ReconcileData = {
  tripId: string;
  tripNo: string;
  version: number;
  drops: {
    id: string;
    label: string;
    customerId: string;
    lines: {
      id: string;
      label: string;
      size: string | null;
      sourceType: "FRESH" | "OUTSTANDING" | "ADHOC";
      qtyLoaded: number;
      customerPoLineId: string | null;
      plannedOutstandingId: string | null;
    }[];
  }[];
  capacityByPoLine: Record<string, { capacity: number; qtyCurrent: number; cancelled: boolean; productionQty: number | null }>;
  outstandingOptions: {
    id: string;
    customerId: string;
    label: string;
    size: string | null;
    remaining: number;
    qtyOriginal: number;
    ageDays: number;
    openedAt: string;
  }[];
  products: { id: string; label: string }[];
};

type AllocRow = { key: number; kind: "FRESH" | "OUTSTANDING" | "ADHOC"; outstandingId: string; qty: string };

let keySeq = 0;
const nextKey = () => ++keySeq;

const KIND_LABEL: Record<string, string> = { FRESH: "ตัดออเดอร์ใหม่", OUTSTANDING: "ตัดของค้างเดิม", ADHOC: "ของหน้างาน (ไม่มีออเดอร์)" };

export function ReconcileForm({ data }: { data: ReconcileData }) {
  const allLines = data.drops.flatMap((d) => d.lines.map((l) => ({ ...l, dropLabel: d.label, customerId: d.customerId })));

  // prefill: FRESH → ออเดอร์ใหม่เท่าที่ capacity เหลือ (แบ่งตามลำดับรายการ) ส่วนที่เกินปล่อย
  // ว่างให้คนตัดสิน · OUTSTANDING → บัตรที่วางแผนไว้ (cap ที่ยอดเหลือ) · ADHOC → ของหน้างาน
  const [allocs, setAllocs] = useState<Record<string, AllocRow[]>>(() => {
    const capLeft = new Map(Object.entries(data.capacityByPoLine).map(([k, v]) => [k, v.capacity]));
    const outLeft = new Map(data.outstandingOptions.map((o) => [o.id, o.remaining]));
    const result: Record<string, AllocRow[]> = {};
    for (const line of allLines) {
      const rows: AllocRow[] = [];
      let unassigned = line.qtyLoaded;
      if (line.sourceType === "ADHOC") {
        if (unassigned > 0) rows.push({ key: nextKey(), kind: "ADHOC", outstandingId: "", qty: String(unassigned) });
        unassigned = 0;
      } else if (line.sourceType === "OUTSTANDING" && line.plannedOutstandingId && outLeft.has(line.plannedOutstandingId)) {
        const take = Math.min(unassigned, outLeft.get(line.plannedOutstandingId)!);
        if (take > 0) {
          rows.push({ key: nextKey(), kind: "OUTSTANDING", outstandingId: line.plannedOutstandingId, qty: String(take) });
          outLeft.set(line.plannedOutstandingId, outLeft.get(line.plannedOutstandingId)! - take);
          unassigned -= take;
        }
      } else if (line.customerPoLineId && capLeft.has(line.customerPoLineId)) {
        const take = Math.min(unassigned, capLeft.get(line.customerPoLineId)!);
        if (take > 0) {
          rows.push({ key: nextKey(), kind: "FRESH", outstandingId: "", qty: String(take) });
          capLeft.set(line.customerPoLineId, capLeft.get(line.customerPoLineId)! - take);
          unassigned -= take;
        }
      }
      result[line.id] = rows;
    }
    return result;
  });

  const [isPending, startTransition] = useTransition();
  const [correctingLineId, setCorrectingLineId] = useState<string | null>(null);
  const [correctQty, setCorrectQty] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [addingAdhocDropId, setAddingAdhocDropId] = useState<string | null>(null);
  const [adhocLabel, setAdhocLabel] = useState("");
  const [adhocSize, setAdhocSize] = useState("");
  const [adhocQty, setAdhocQty] = useState("");
  const [adhocProductId, setAdhocProductId] = useState("");
  const router = useRouter();
  const { showError } = useToast();

  function patchRows(lineId: string, rows: AllocRow[]) {
    setAllocs((prev) => ({ ...prev, [lineId]: rows }));
  }

  // ---------- คำนวณ preview สด ----------
  const freshUsed = new Map<string, number>();
  const outUsed = new Map<string, number>();
  let adhocTotal = 0;
  const unassignedByLine = new Map<string, number>();
  for (const line of allLines) {
    let sum = 0;
    for (const row of allocs[line.id] ?? []) {
      const q = Number(row.qty) || 0;
      sum += q;
      if (row.kind === "FRESH" && line.customerPoLineId) freshUsed.set(line.customerPoLineId, (freshUsed.get(line.customerPoLineId) ?? 0) + q);
      if (row.kind === "OUTSTANDING" && row.outstandingId) outUsed.set(row.outstandingId, (outUsed.get(row.outstandingId) ?? 0) + q);
      if (row.kind === "ADHOC") adhocTotal += q;
    }
    unassignedByLine.set(line.id, line.qtyLoaded - sum);
  }
  const previewNewOutstanding = Object.entries(data.capacityByPoLine)
    .map(([poLineId, c]) => ({ poLineId, qty: c.capacity - (freshUsed.get(poLineId) ?? 0) }))
    .filter((e) => e.qty > 0);
  const previewOutstanding = data.outstandingOptions
    .map((o) => ({ ...o, used: outUsed.get(o.id) ?? 0 }))
    .filter((o) => o.used > 0);
  const allAssigned = [...unassignedByLine.values()].every((v) => v === 0);
  const freshOver = Object.entries(data.capacityByPoLine).find(([poLineId, c]) => (freshUsed.get(poLineId) ?? 0) > c.capacity);
  const outOver = data.outstandingOptions.find((o) => (outUsed.get(o.id) ?? 0) > o.remaining);

  function labelForPoLine(poLineId: string): string {
    const line = allLines.find((l) => l.customerPoLineId === poLineId);
    return line ? `${line.label}${line.size ? ` (${line.size})` : ""}` : poLineId;
  }

  function handleSubmit() {
    if (!allAssigned) {
      showError("ยังมีของที่ยังไม่ได้ระบุที่มา — ทุกชิ้นที่ขึ้นจริงต้องรู้ว่าตัดจากอะไร (ส่วนที่ไม่มีออเดอร์ให้เลือก 'ของหน้างาน')");
      return;
    }
    if (freshOver) {
      showError("ตัดออเดอร์ใหม่เกินยอดที่ลูกค้ายังต้องได้ — ปรับส่วนเกินเป็นของหน้างานหรือของค้างเดิม");
      return;
    }
    if (outOver) {
      showError("ตัดบัตรค้างเกินยอดที่เหลือ — กรุณาปรับ");
      return;
    }
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("version", String(data.version));
        formData.set(
          "allocationsJson",
          JSON.stringify(
            allLines.map((line) => ({
              lineId: line.id,
              allocations: (allocs[line.id] ?? [])
                .filter((r) => Number(r.qty) > 0)
                .map((r) => ({ kind: r.kind, outstandingId: r.kind === "OUTSTANDING" ? r.outstandingId : undefined, qty: Number(r.qty) })),
            }))
          )
        );
        const result = await reconcileLoadingTrip(data.tripId, formData);
        if (!result.success) {
          showError(result.error);
          return;
        }
        router.push(`/production/loading/${data.tripId}`);
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("กระทบยอดไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  function runAction(fn: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.success) {
          showError(result.error ?? "ไม่สำเร็จ");
          return;
        }
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง");
      }
    });
  }

  return (
    <div className="space-y-3">
      {data.drops.map((drop) => {
        const outOptions = data.outstandingOptions.filter((o) => o.customerId === drop.customerId);
        return (
          <div key={drop.id} className="bg-white border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{drop.label}</span>
              <button
                type="button"
                onClick={() => {
                  setAddingAdhocDropId(addingAdhocDropId === drop.id ? null : drop.id);
                  setAdhocLabel("");
                  setAdhocSize("");
                  setAdhocQty("");
                  setAdhocProductId("");
                }}
                className="text-xs text-cp-navy hover:underline"
              >
                + ของหน้างานที่เขียนเพิ่มในใบ
              </button>
            </div>

            {addingAdhocDropId === drop.id && (
              <div className="bg-gray-50 border rounded p-2 space-y-1.5 mb-2">
                <p className="text-xs text-gray-600">คีย์รายการที่เขียนมือเพิ่มหน้างาน (ไม่มีออเดอร์ต้นทาง — ไม่สร้างออเดอร์ปลอม)</p>
                <input value={adhocLabel} onChange={(e) => setAdhocLabel(e.target.value)} placeholder="ชื่อสินค้า *" className="w-full border rounded px-2 py-1.5 text-sm" />
                <div className="flex gap-1.5">
                  <input value={adhocSize} onChange={(e) => setAdhocSize(e.target.value)} placeholder="ไซส์" className="w-24 border rounded px-2 py-1.5 text-sm" />
                  <input type="number" min="1" value={adhocQty} onChange={(e) => setAdhocQty(e.target.value)} placeholder="จำนวนที่ขึ้นจริง *" className="w-36 border rounded px-2 py-1.5 text-sm" />
                </div>
                <select value={adhocProductId} onChange={(e) => setAdhocProductId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="">— ผูกสินค้าในระบบ (ถ้ามี) —</option>
                  {data.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isPending || !adhocLabel || !adhocQty}
                  onClick={() =>
                    runAction(async () => {
                      const formData = new FormData();
                      formData.set("version", String(data.version));
                      formData.set("label", adhocLabel);
                      formData.set("size", adhocSize);
                      formData.set("qtyLoaded", adhocQty);
                      formData.set("productId", adhocProductId);
                      return addAdhocLine(data.tripId, drop.id, formData);
                    })
                  }
                  className="w-full bg-cp-navy hover:bg-cp-navy-light disabled:opacity-50 text-white text-sm rounded px-3 py-1.5"
                >
                  เพิ่มรายการหน้างาน
                </button>
              </div>
            )}

            <div className="space-y-2">
              {drop.lines.map((line) => {
                const rows = allocs[line.id] ?? [];
                const unassigned = unassignedByLine.get(line.id) ?? 0;
                const cap = line.customerPoLineId ? data.capacityByPoLine[line.customerPoLineId] : null;
                return (
                  <div key={line.id} className={`border rounded p-2 ${unassigned !== 0 ? "border-red-300 bg-red-50/30" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 font-medium">
                        {line.label}
                        {line.size && <span className="text-gray-500 font-normal"> (ไซส์ {line.size})</span>}
                        {line.sourceType === "ADHOC" && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">หน้างาน</span>}
                      </span>
                      <span className="shrink-0 text-sm">
                        ขึ้นจริง <span className="font-semibold">{line.qtyLoaded}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCorrectingLineId(correctingLineId === line.id ? null : line.id);
                            setCorrectQty(String(line.qtyLoaded));
                            setCorrectReason("");
                          }}
                          className="ml-2 text-xs text-blue-700 hover:underline"
                        >
                          แก้ยอด
                        </button>
                        {line.sourceType === "ADHOC" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              runAction(async () => {
                                const formData = new FormData();
                                formData.set("version", String(data.version));
                                return removeAdhocLine(data.tripId, line.id, formData);
                              })
                            }
                            className="ml-2 text-xs text-red-600 hover:underline"
                          >
                            ลบ
                          </button>
                        )}
                      </span>
                    </div>

                    {cap && cap.productionQty != null && cap.productionQty !== cap.qtyCurrent && (
                      <p className="text-xs text-amber-700 mt-0.5">
                        ⚠ ยอดออเดอร์ปัจจุบัน {cap.qtyCurrent} ≠ ยอดสั่งผลิตล่าสุด {cap.productionQty} — ของค้างคิดจากยอดออเดอร์เสมอ
                      </p>
                    )}

                    {correctingLineId === line.id && (
                      <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-1.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">ยอดขึ้นจริงที่ถูกต้อง:</span>
                          <input type="number" min="0" value={correctQty} onChange={(e) => setCorrectQty(e.target.value)} className="w-24 border rounded px-2 py-1 text-sm" />
                        </div>
                        <input value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} placeholder="เหตุผลที่แก้ *" className="w-full border rounded px-2 py-1 text-sm" />
                        <button
                          type="button"
                          disabled={isPending || !correctReason.trim()}
                          onClick={() =>
                            runAction(async () => {
                              const formData = new FormData();
                              formData.set("version", String(data.version));
                              formData.set("qtyLoaded", correctQty);
                              formData.set("reason", correctReason);
                              const result = await correctLoadingLineQty(data.tripId, line.id, formData);
                              if (result.success) setCorrectingLineId(null);
                              return result;
                            })
                          }
                          className="text-xs bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded px-3 py-1"
                        >
                          บันทึกยอดใหม่ (มีบันทึกประวัติ)
                        </button>
                      </div>
                    )}

                    {/* แถวการตัด */}
                    <div className="mt-1.5 space-y-1">
                      {rows.map((row) => (
                        <div key={row.key} className="flex items-center gap-1.5 text-sm">
                          <select
                            value={row.kind}
                            onChange={(e) => patchRows(line.id, rows.map((r) => (r.key === row.key ? { ...r, kind: e.target.value as AllocRow["kind"], outstandingId: "" } : r)))}
                            className="border rounded px-2 py-1 text-xs"
                          >
                            <option value="FRESH" disabled={!line.customerPoLineId}>ตัดออเดอร์ใหม่</option>
                            <option value="OUTSTANDING" disabled={outOptions.length === 0}>ตัดของค้างเดิม</option>
                            <option value="ADHOC">ของหน้างาน (ไม่มีออเดอร์)</option>
                          </select>
                          {row.kind === "OUTSTANDING" && (
                            <select
                              value={row.outstandingId}
                              onChange={(e) => patchRows(line.id, rows.map((r) => (r.key === row.key ? { ...r, outstandingId: e.target.value } : r)))}
                              className="border rounded px-2 py-1 text-xs flex-1 min-w-0"
                            >
                              <option value="">— เลือกบัตรค้าง —</option>
                              {outOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                  {o.size ? ` (${o.size})` : ""} · เหลือ {o.remaining} · ค้างมา {o.ageDays} วัน
                                </option>
                              ))}
                            </select>
                          )}
                          <input
                            type="number"
                            min="1"
                            value={row.qty}
                            onChange={(e) => patchRows(line.id, rows.map((r) => (r.key === row.key ? { ...r, qty: e.target.value } : r)))}
                            className="w-20 border rounded px-2 py-1 text-sm text-right"
                          />
                          <button type="button" onClick={() => patchRows(line.id, rows.filter((r) => r.key !== row.key))} className="text-gray-400 hover:text-red-600 px-1">
                            ×
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => patchRows(line.id, [...rows, { key: nextKey(), kind: line.customerPoLineId ? "FRESH" : "ADHOC", outstandingId: "", qty: String(Math.max(unassigned, 0) || "") }])}
                          className="text-xs text-cp-navy hover:underline"
                        >
                          + เพิ่มแหล่งที่ตัด
                        </button>
                        {unassigned !== 0 && (
                          <span className="text-xs text-red-600 font-medium">
                            {unassigned > 0 ? `ยังไม่ระบุที่มา ${unassigned} ชิ้น` : `ตัดเกินยอดขึ้นจริง ${-unassigned} ชิ้น`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {drop.lines.length === 0 && <p className="text-xs text-gray-400">ไม่มีรายการ</p>}
            </div>
          </div>
        );
      })}

      {/* preview ผลลัพธ์ก่อนยืนยัน */}
      <div className="bg-white border-2 border-cp-navy/30 rounded-lg p-3 text-sm space-y-1">
        <div className="font-medium text-gray-700 mb-1">ผลลัพธ์เมื่อกดยืนยัน</div>
        {previewOutstanding.map((o) => (
          <div key={o.id}>
            บัตรค้าง {o.label}
            {o.size ? ` (${o.size})` : ""} (ค้างมา {o.ageDays} วัน): ตัด {o.used} →{" "}
            {o.remaining - o.used === 0 ? <span className="text-green-700 font-medium">ปิดบัตร (ส่งครบ)</span> : `เหลือค้าง ${o.remaining - o.used}`}
          </div>
        ))}
        {previewNewOutstanding.map((e) => (
          <div key={e.poLineId} className="text-amber-700">
            {labelForPoLine(e.poLineId)}: ออเดอร์ใหม่จะเหลือค้าง {e.qty} → เปิดบัตรค้างใหม่ (เริ่มนับอายุวันนี้)
          </div>
        ))}
        {adhocTotal > 0 && <div className="text-gray-600">ของหน้างานไม่มีออเดอร์รวม {adhocTotal} ชิ้น (บันทึกเป็นหลักฐาน ไม่ผูกออเดอร์)</div>}
        {previewOutstanding.length === 0 && previewNewOutstanding.length === 0 && adhocTotal === 0 && (
          <div className="text-green-700">ส่งครบตามยอดออเดอร์ทั้งหมด — ไม่มีของค้างใหม่</div>
        )}
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={handleSubmit}
        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-3"
      >
        {isPending ? "กำลังบันทึก..." : "ยืนยันกระทบยอดตามนี้"}
      </button>
      <p className="text-xs text-gray-400 text-center">ยืนยันแล้วเที่ยวนี้ปิดสมบูรณ์ — การแก้ไขหลังจากนี้ต้องเป็นรายการปรับปรุงที่มีบันทึก ไม่แก้ย้อนหลัง</p>
    </div>
  );
}
