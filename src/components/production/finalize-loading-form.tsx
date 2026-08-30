"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import { finalizeLoadingTrip, addAdhocPlannedLine, removeLoadingLine, removeLoadingPhoto } from "@/app/production/loading/actions";

// CP6 — ฟอร์มบันทึกผลขึ้นของ (รวม confirm+reconcile เดิมเป็นขั้นเดียว "ยืนยันส่งออก"):
// ภาษาหน้างานล้วน ต่อรายการเห็น "ขึ้นจริง N → ตัดจากอะไร → เหลืออะไร" — แถวการตัดถูกเติม
// ให้อัตโนมัติจากบริบทแผน (ไม่ใช่ FIFO — เป็นแค่ค่าตั้งต้นที่ตรงกับแผนที่คนเลือกไว้แล้ว)
// และคำนวณใหม่ตามยอดจริงจนกว่าคนจะเข้าไปแก้แถวของรายการนั้นเอง (touched = หยุด auto)
// server (finalizeLoadingTrip) ตรวจซ้ำทุกกติกาใน tx Serializable เดียว — client validate เพื่อ UX

export type FinalizeData = {
  tripId: string;
  tripNo: string;
  version: number;
  sheetPrinted: boolean;
  drops: {
    id: string;
    label: string;
    customerId: string;
    photoPaths: string[];
    lines: {
      id: string;
      label: string;
      size: string | null;
      sourceType: "FRESH" | "OUTSTANDING" | "ADHOC";
      qtyPlanned: number;
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

export function FinalizeLoadingForm({ data }: { data: FinalizeData }) {
  const allLines = data.drops.flatMap((d) => d.lines.map((l) => ({ ...l, dropLabel: d.label, customerId: d.customerId })));

  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(allLines.map((l) => [l.id, String(l.qtyPlanned)]))
  );
  // แถวการตัดที่คนแก้เองแล้ว (หยุด auto-default ของรายการนั้น) — รายการที่ไม่อยู่ในนี้คำนวณสด
  const [manualAllocs, setManualAllocs] = useState<Record<string, AllocRow[]>>({});
  const [uploadingDropId, setUploadingDropId] = useState<string | null>(null);
  const [addingAdhocDropId, setAddingAdhocDropId] = useState<string | null>(null);
  const [adhocLabel, setAdhocLabel] = useState("");
  const [adhocSize, setAdhocSize] = useState("");
  const [adhocQty, setAdhocQty] = useState("");
  const [adhocProductId, setAdhocProductId] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

  // ---------- auto-default + preview คำนวณสดทุก render ----------
  // 1) หัก capacity/ยอดค้างด้วยแถวที่คนแก้เองก่อน 2) เติม default ให้รายการที่ยังไม่ถูกแตะ
  // ตามลำดับรายการ (แบ่งกันจากยอดที่เหลือ — ส่วนที่เกินปล่อยว่างให้คนตัดสิน)
  const capLeft = new Map(Object.entries(data.capacityByPoLine).map(([k, v]) => [k, v.capacity]));
  const outLeft = new Map(data.outstandingOptions.map((o) => [o.id, o.remaining]));
  for (const line of allLines) {
    const rows = manualAllocs[line.id];
    if (!rows) continue;
    for (const row of rows) {
      const q = Number(row.qty) || 0;
      if (row.kind === "FRESH" && line.customerPoLineId) capLeft.set(line.customerPoLineId, (capLeft.get(line.customerPoLineId) ?? 0) - q);
      if (row.kind === "OUTSTANDING" && row.outstandingId) outLeft.set(row.outstandingId, (outLeft.get(row.outstandingId) ?? 0) - q);
    }
  }
  const effectiveAllocs: Record<string, AllocRow[]> = {};
  for (const line of allLines) {
    if (manualAllocs[line.id]) {
      effectiveAllocs[line.id] = manualAllocs[line.id];
      continue;
    }
    const qtyNum = Number(qty[line.id]) || 0;
    const rows: AllocRow[] = [];
    let unassigned = qtyNum;
    if (line.sourceType === "ADHOC") {
      if (unassigned > 0) rows.push({ key: -1, kind: "ADHOC", outstandingId: "", qty: String(unassigned) });
      unassigned = 0;
    } else if (line.sourceType === "OUTSTANDING" && line.plannedOutstandingId && outLeft.has(line.plannedOutstandingId)) {
      const take = Math.min(unassigned, Math.max(outLeft.get(line.plannedOutstandingId)!, 0));
      if (take > 0) {
        rows.push({ key: -1, kind: "OUTSTANDING", outstandingId: line.plannedOutstandingId, qty: String(take) });
        outLeft.set(line.plannedOutstandingId, outLeft.get(line.plannedOutstandingId)! - take);
        unassigned -= take;
      }
    } else if (line.customerPoLineId && capLeft.has(line.customerPoLineId)) {
      const take = Math.min(unassigned, Math.max(capLeft.get(line.customerPoLineId)!, 0));
      if (take > 0) {
        rows.push({ key: -1, kind: "FRESH", outstandingId: "", qty: String(take) });
        capLeft.set(line.customerPoLineId, capLeft.get(line.customerPoLineId)! - take);
        unassigned -= take;
      }
    }
    effectiveAllocs[line.id] = rows;
  }

  // preview รวม
  const freshUsed = new Map<string, number>();
  const outUsed = new Map<string, number>();
  let adhocTotal = 0;
  const unassignedByLine = new Map<string, number>();
  for (const line of allLines) {
    let sum = 0;
    for (const row of effectiveAllocs[line.id] ?? []) {
      const q = Number(row.qty) || 0;
      sum += q;
      if (row.kind === "FRESH" && line.customerPoLineId) freshUsed.set(line.customerPoLineId, (freshUsed.get(line.customerPoLineId) ?? 0) + q);
      if (row.kind === "OUTSTANDING" && row.outstandingId) outUsed.set(row.outstandingId, (outUsed.get(row.outstandingId) ?? 0) + q);
      if (row.kind === "ADHOC") adhocTotal += q;
    }
    unassignedByLine.set(line.id, (Number(qty[line.id]) || 0) - sum);
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
  const totalPlanned = allLines.reduce((s, l) => s + l.qtyPlanned, 0);
  const totalLoaded = allLines.reduce((s, l) => s + (Number(qty[l.id]) || 0), 0);

  function labelForPoLine(poLineId: string): string {
    const line = allLines.find((l) => l.customerPoLineId === poLineId);
    return line ? `${line.label}${line.size ? ` (${line.size})` : ""}` : poLineId;
  }

  // แตะแถวการตัดของรายการไหน = ยึดค่าที่เห็นอยู่เป็น manual (หยุด auto ของรายการนั้น)
  function materialize(lineId: string): AllocRow[] {
    return (effectiveAllocs[lineId] ?? []).map((r) => (r.key === -1 ? { ...r, key: nextKey() } : r));
  }
  function patchRows(lineId: string, rows: AllocRow[]) {
    setManualAllocs((prev) => ({ ...prev, [lineId]: rows }));
  }
  function resetLine(lineId: string) {
    setManualAllocs((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  }

  async function uploadPhoto(dropId: string, file: File) {
    setUploadingDropId(dropId);
    try {
      const formData = new FormData();
      formData.set("tripId", data.tripId);
      formData.set("dropId", dropId);
      formData.set("file", file);
      const res = await fetch("/api/production/loading-photos", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(body.error ?? "อัปโหลดรูปไม่สำเร็จ");
        return;
      }
      router.refresh();
    } catch {
      showError("อัปโหลดรูปไม่สำเร็จ — กรุณาลองอีกครั้ง");
    } finally {
      setUploadingDropId(null);
    }
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

  function handleSubmit() {
    for (const line of allLines) {
      const n = Number(qty[line.id]);
      if (!Number.isInteger(n) || n < 0) {
        showError(`กรุณากรอกจำนวนเต็ม 0 ขึ้นไปให้ครบทุกรายการ (ติดที่ "${line.label}")`);
        return;
      }
    }
    const missingPhoto = data.drops.find((d) => d.lines.length > 0 && d.photoPaths.length === 0);
    if (missingPhoto) {
      showError(`จุดส่ง "${missingPhoto.label}" ยังไม่มีรูปใบขึ้นของ — แนบรูปก่อนยืนยันส่งออก`);
      return;
    }
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
        formData.set("linesJson", JSON.stringify(allLines.map((l) => ({ lineId: l.id, qtyLoaded: Number(qty[l.id]) }))));
        formData.set(
          "allocationsJson",
          JSON.stringify(
            allLines.map((line) => ({
              lineId: line.id,
              allocations: (effectiveAllocs[line.id] ?? [])
                .filter((r) => Number(r.qty) > 0)
                .map((r) => ({ kind: r.kind, outstandingId: r.kind === "OUTSTANDING" ? r.outstandingId : undefined, qty: Number(r.qty) })),
            }))
          )
        );
        const result = await finalizeLoadingTrip(data.tripId, formData);
        if (!result.success) {
          showError(result.error);
          return;
        }
        router.push(`/production/loading/${data.tripId}`);
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  return (
    <div className="space-y-3">
      {!data.sheetPrinted && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2">
          ⚠ รอบนี้ยังไม่ได้บันทึกว่าพิมพ์ใบขึ้นของ — บันทึกผลได้ แต่ปกติควรพิมพ์ใบให้หน้างานขีดนับก่อน
        </div>
      )}

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
                + ของที่เพิ่มหน้างาน
              </button>
            </div>

            {addingAdhocDropId === drop.id && (
              <div className="bg-gray-50 border rounded p-2 space-y-1.5 mb-2">
                <p className="text-xs text-gray-600">คีย์รายการที่เพิ่มหน้างาน/เขียนมือในใบ (ไม่มีออเดอร์ต้นทาง — ไม่สร้างออเดอร์ปลอม)</p>
                <input value={adhocLabel} onChange={(e) => setAdhocLabel(e.target.value)} placeholder="ชื่อสินค้า *" className="w-full border rounded px-2 py-1.5 text-sm" />
                <div className="flex gap-1.5">
                  <input value={adhocSize} onChange={(e) => setAdhocSize(e.target.value)} placeholder="ไซส์" className="w-24 border rounded px-2 py-1.5 text-sm" />
                  <input type="number" min="1" value={adhocQty} onChange={(e) => setAdhocQty(e.target.value)} placeholder="จำนวน *" className="w-28 border rounded px-2 py-1.5 text-sm" />
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
                  disabled={isPending || !adhocLabel.trim() || !adhocQty}
                  onClick={() =>
                    runAction(async () => {
                      const formData = new FormData();
                      formData.set("version", String(data.version));
                      formData.set("label", adhocLabel);
                      formData.set("size", adhocSize);
                      formData.set("qtyPlanned", adhocQty);
                      formData.set("productId", adhocProductId);
                      const result = await addAdhocPlannedLine(data.tripId, drop.id, formData);
                      if (result.success) setAddingAdhocDropId(null);
                      return result;
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
                const rows = effectiveAllocs[line.id] ?? [];
                const isManual = !!manualAllocs[line.id];
                const unassigned = unassignedByLine.get(line.id) ?? 0;
                const cap = line.customerPoLineId ? data.capacityByPoLine[line.customerPoLineId] : null;
                return (
                  <div key={line.id} className={`border rounded p-2 ${unassigned !== 0 ? "border-red-300 bg-red-50/30" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 font-medium">
                        {line.label}
                        {line.size && <span className="text-gray-500 font-normal"> (ไซส์ {line.size})</span>}
                        {line.sourceType === "ADHOC" && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">หน้างาน</span>}
                        <span className="text-xs text-gray-400 ml-1">แผน {line.qtyPlanned}</span>
                        {line.sourceType === "ADHOC" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              runAction(async () => {
                                const formData = new FormData();
                                formData.set("version", String(data.version));
                                return removeLoadingLine(data.tripId, line.id, formData);
                              })
                            }
                            className="ml-2 text-xs text-red-600 hover:underline"
                          >
                            ลบ
                          </button>
                        )}
                      </span>
                      <span className="shrink-0 flex items-center gap-1.5 text-sm">
                        <span className="text-xs text-gray-500">ขึ้นจริง</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={qty[line.id] ?? ""}
                          onChange={(e) => setQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                          className={`w-20 border rounded px-2 py-1.5 text-sm text-right ${Number(qty[line.id]) !== line.qtyPlanned ? "border-amber-400 bg-amber-50" : ""}`}
                        />
                      </span>
                    </div>

                    {cap && cap.productionQty != null && cap.productionQty !== cap.qtyCurrent && (
                      <p className="text-xs text-amber-700 mt-0.5">
                        ⚠ ยอดออเดอร์ปัจจุบัน {cap.qtyCurrent} ≠ ยอดสั่งผลิตล่าสุด {cap.productionQty} — ของค้างคิดจากยอดออเดอร์เสมอ
                      </p>
                    )}

                    {/* แถวการตัด (auto จนกว่าจะแตะ) */}
                    <div className="mt-1.5 space-y-1">
                      {rows.map((row, rowIdx) => (
                        <div key={row.key === -1 ? `auto-${rowIdx}` : row.key} className="flex items-center gap-1.5 text-sm">
                          <select
                            value={row.kind}
                            onChange={(e) => {
                              const m = materialize(line.id);
                              patchRows(line.id, m.map((r, i) => (i === rowIdx ? { ...r, kind: e.target.value as AllocRow["kind"], outstandingId: "" } : r)));
                            }}
                            className="border rounded px-2 py-1 text-xs"
                          >
                            <option value="FRESH" disabled={!line.customerPoLineId}>ตัดออเดอร์ใหม่</option>
                            <option value="OUTSTANDING" disabled={outOptions.length === 0}>ตัดของค้างเดิม</option>
                            <option value="ADHOC">ของหน้างาน (ไม่มีออเดอร์)</option>
                          </select>
                          {row.kind === "OUTSTANDING" && (
                            <select
                              value={row.outstandingId}
                              onChange={(e) => {
                                const m = materialize(line.id);
                                patchRows(line.id, m.map((r, i) => (i === rowIdx ? { ...r, outstandingId: e.target.value } : r)));
                              }}
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
                            onChange={(e) => {
                              const m = materialize(line.id);
                              patchRows(line.id, m.map((r, i) => (i === rowIdx ? { ...r, qty: e.target.value } : r)));
                            }}
                            className="w-20 border rounded px-2 py-1 text-sm text-right"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const m = materialize(line.id);
                              patchRows(line.id, m.filter((_, i) => i !== rowIdx));
                            }}
                            className="text-gray-400 hover:text-red-600 px-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const m = materialize(line.id);
                              patchRows(line.id, [...m, { key: nextKey(), kind: line.customerPoLineId ? "FRESH" : "ADHOC", outstandingId: "", qty: String(Math.max(unassigned, 0) || "") }]);
                            }}
                            className="text-xs text-cp-navy hover:underline"
                          >
                            + เพิ่มแหล่งที่ตัด
                          </button>
                          {isManual && (
                            <button type="button" onClick={() => resetLine(line.id)} className="text-xs text-gray-400 hover:underline">
                              กลับเป็นอัตโนมัติ
                            </button>
                          )}
                        </span>
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
              {drop.lines.length === 0 && <p className="text-xs text-gray-400">จุดนี้ไม่มีรายการ — ไม่ต้องกรอก/แนบรูป</p>}
            </div>

            {drop.lines.length > 0 && (
              <div className="mt-3 border-t pt-2">
                <div className="text-xs font-medium text-gray-600 mb-1.5">รูปใบขึ้นของที่ขีดนับแล้ว * ({drop.photoPaths.length})</div>
                <div className="flex flex-wrap gap-2">
                  {drop.photoPaths.map((p) => (
                    <span key={p} className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/production/loading-photos/${p}`} alt="รูปใบขึ้นของ" className="w-20 h-20 object-cover rounded border" />
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          runAction(async () => {
                            const formData = new FormData();
                            formData.set("version", String(data.version));
                            formData.set("path", p);
                            return removeLoadingPhoto(data.tripId, drop.id, formData);
                          })
                        }
                        className="absolute -top-1.5 -right-1.5 bg-white border rounded-full w-5 h-5 text-xs text-gray-500 hover:text-red-600 leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <label className="w-20 h-20 border-2 border-dashed rounded flex flex-col items-center justify-center text-xs text-gray-400 cursor-pointer hover:border-cp-navy hover:text-cp-navy">
                    {uploadingDropId === drop.id ? "..." : "+ รูป"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={uploadingDropId !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadPhoto(drop.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="bg-white border rounded-lg p-3 text-sm flex items-center justify-between">
        <span className="text-gray-600">รวมตามแผน {totalPlanned} ชิ้น</span>
        <span className="font-semibold">รวมขึ้นจริง {totalLoaded} ชิ้น</span>
      </div>

      {/* preview ผลลัพธ์ก่อนยืนยัน */}
      <div className="bg-white border-2 border-cp-navy/30 rounded-lg p-3 text-sm space-y-1">
        <div className="font-medium text-gray-700 mb-1">ผลลัพธ์เมื่อกดยืนยันส่งออก</div>
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
        {isPending ? "กำลังบันทึก..." : "ยืนยันส่งออก"}
      </button>
      <p className="text-xs text-gray-400 text-center">
        ยืนยันแล้วรอบนี้ปิดสมบูรณ์เป็น &quot;สินค้าถูกส่งออกแล้ว&quot; — ยอดขึ้นจริง/ที่มา/บัตรค้างถูกบันทึกพร้อมกันทั้งหมด แก้ย้อนหลังไม่ได้
      </p>
    </div>
  );
}
