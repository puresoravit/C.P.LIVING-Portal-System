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
  // CP7 round 11 (Owner: กรอบ "ตัดยอดนี้จากอะไร" งง ต้องมานั่งเลือกเอง) — ซ่อนกล่องแก้ไข
  // ที่มาไว้เป็นค่าเริ่มต้นเสมอ (auto-fill คำนวณเงียบๆ อยู่แล้ว) เปิดให้เห็นเฉพาะ (1) คนกด
  // "แก้ไขที่มา" เอง หรือ (2) auto-fill หาที่มาให้ไม่ครบจริงๆ (unassigned !== 0 — ต้องให้คน
  // ตัดสินใจ ตามกฎห้ามตัดยอดให้เอง)
  const [expandedAlloc, setExpandedAlloc] = useState<Record<string, boolean>>({});
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
    // CP7 round 10 (Owner) — ถ้าขึ้นจริงเกินแผนของรายการนี้ ส่วนที่เกินคือของที่ไม่ได้อยู่ใน
    // แผนอยู่แล้วโดยนิยาม (ไม่มีที่มาอื่นให้เลือกจริงๆ) — ตัดเป็น "ของหน้างาน" ให้อัตโนมัติ
    // ทันที ไม่ต้องให้คนกดปุ่มเพิ่มแหล่งเองสำหรับส่วนนี้ (ยังแก้เป็นแหล่งอื่นเองได้ถ้าต้องการ
    // ผ่านปุ่ม "แยกที่มาเพิ่ม" — auto-fill นี้เป็นแค่ค่าตั้งต้น)
    const excess = Math.max(0, qtyNum - line.qtyPlanned);
    if (excess > 0) rows.push({ key: -1, kind: "ADHOC", outstandingId: "", qty: String(excess) });
    let unassigned = qtyNum - excess;
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
                className="text-xs font-medium text-cp-navy border border-cp-navy/40 rounded-full px-2.5 py-1 hover:bg-cp-navy/5"
              >
                + สินค้าที่เพิ่มหน้างาน
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
                // CP7 round 10 (Owner: "ลองวิเคราะห์การแสดงผลในหน้านี้ใหม่ดู เอาให้เข้าใจง่าย")
                // — สรุปเป็นประโยคเดียวต่อรายการ ไม่ต้องเดาจากช่องตัดที่อาจว่างเปล่า (เช่น
                // ขึ้นจริง 0 = แถวตัดว่างเพราะไม่มีอะไรให้ตัด ไม่ใช่ข้อมูลหาย)
                const qtyNum = Number(qty[line.id]) || 0;
                const lineExcess = Math.max(0, qtyNum - line.qtyPlanned);
                const lineShort = Math.max(0, line.qtyPlanned - qtyNum);
                let summary: { text: string; tone: "green" | "amber" | "red" | "blue" } | null = null;
                if (qtyNum === line.qtyPlanned) {
                  summary = null; // ตรงตามแผนเป๊ะ ไม่ต้องมีข้อความพิเศษ
                } else if (qtyNum === 0 && line.qtyPlanned > 0) {
                  summary = { text: `ยังไม่ได้ขึ้นเลย → ค้างส่งทั้งหมด ${line.qtyPlanned} ชิ้น`, tone: "red" };
                } else if (lineExcess > 0 && lineShort === 0) {
                  summary = { text: `เกินแผน ${lineExcess} ชิ้น → นับเป็น "ของหน้างาน" เพิ่มให้อัตโนมัติ`, tone: "blue" };
                } else if (lineShort > 0) {
                  summary = { text: `ขึ้นได้ ${qtyNum}/${line.qtyPlanned} → เหลือค้างส่ง ${lineShort} ชิ้น`, tone: "amber" };
                }
                const summaryClass =
                  summary?.tone === "red" ? "text-red-700 bg-red-50 border-red-200"
                  : summary?.tone === "blue" ? "text-blue-700 bg-blue-50 border-blue-200"
                  : "text-amber-700 bg-amber-50 border-amber-200";
                // unassigned !== 0 = auto-fill หาที่มาให้ไม่ครบจริง (เช่น capacity ไม่พอ) ต้อง
                // บังคับเปิดกล่องให้คนตัดสินใจเอง ไม่ปล่อยให้ระบบเดา (กฎห้ามตัดยอดให้เอง)
                const forceShowEditor = unassigned !== 0;
                const showEditor = !!expandedAlloc[line.id] || forceShowEditor;
                return (
                  <div key={line.id} className={`border rounded p-2 ${unassigned !== 0 ? "border-red-300 bg-red-50/30" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 font-medium">
                        {line.label}
                        {line.size && <span className="text-gray-500 font-normal"> (ไซส์ {line.size})</span>}
                        {line.sourceType === "ADHOC" && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">หน้างาน</span>}
                        <span className="text-xs text-gray-400 ml-1">จำนวนตามใบผลิต {line.qtyPlanned}</span>
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

                    {summary && (
                      <p className={`text-xs rounded px-2 py-1 mt-1 border ${summaryClass}`}>{summary.text}</p>
                    )}

                    {cap && cap.productionQty != null && cap.productionQty !== cap.qtyCurrent && (
                      <p className="text-xs text-amber-700 mt-0.5">
                        ⚠ ยอดออเดอร์ปัจจุบัน {cap.qtyCurrent} ≠ ยอดสั่งผลิตล่าสุด {cap.productionQty} — ของค้างคิดจากยอดออเดอร์เสมอ
                      </p>
                    )}

                    {/* แถวการตัด — auto-fill เงียบๆ อยู่เบื้องหลังเสมอ ไม่บังคับให้พนักงานเห็น/
                        แก้ทุกรายการ (CP7 round 11) ยกเว้นตอนที่ auto-fill หาที่มาให้ไม่ครบจริง
                        (unassigned !== 0) ซึ่งต้องให้คนตัดสินใจตามกฎห้ามตัดยอดให้เอง */}
                    {rows.length > 0 && !showEditor && (
                      <button
                        type="button"
                        onClick={() => setExpandedAlloc((prev) => ({ ...prev, [line.id]: true }))}
                        className="text-[10px] text-gray-400 hover:text-cp-navy hover:underline mt-1"
                      >
                        แก้ไขที่มา (ปกติไม่ต้องกด — ระบบจัดให้อัตโนมัติแล้ว)
                      </button>
                    )}
                    {showEditor && (
                    <div className="mt-1.5 space-y-1">
                      {rows.length > 0 && <p className="text-[10px] text-gray-400">ตัดยอดนี้จากอะไร (เติมให้อัตโนมัติ แก้ได้ทุกช่อง):</p>}
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
                            title="ใช้เมื่อของขึ้นจริงชิ้นเดียวกันมาจากมากกว่า 1 ที่ เช่น 3 ชิ้นจากออเดอร์ใหม่ + 2 ชิ้นจากของค้างเดิม"
                          >
                            + แยกที่มาเพิ่ม
                          </button>
                          {isManual && (
                            <button type="button" onClick={() => resetLine(line.id)} className="text-xs text-gray-400 hover:underline">
                              กลับเป็นอัตโนมัติ
                            </button>
                          )}
                          {!forceShowEditor && (
                            <button
                              type="button"
                              onClick={() => setExpandedAlloc((prev) => ({ ...prev, [line.id]: false }))}
                              className="text-xs text-gray-400 hover:underline"
                            >
                              ซ่อน
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
                    )}
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
                    {/* CP7 round 10 (Owner) — ตัด capture="environment" ออก: attribute นี้บังคับเปิด
                        กล้องตรงๆ บนมือถือบางรุ่น ทำให้เลือกรูปจากอัลบั้มไม่ได้เลย — ไม่ใส่
                        attribute นี้จะให้ระบบมือถือเปิด picker ปกติที่มีทั้ง "ถ่ายรูป" และ
                        "เลือกจากอัลบั้ม" ให้เลือกเอง (พฤติกรรมมาตรฐานของ input type=file) */}
                    <input
                      type="file"
                      accept="image/*"
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
