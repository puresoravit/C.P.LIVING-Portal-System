"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { LoadingTripHeaderForm } from "@/components/production/loading-trip-header-form";
import {
  updateLoadingTripHeader,
  addLoadingDrop,
  removeLoadingDrop,
  moveLoadingDrop,
  addLoadingLine,
  removeLoadingLine,
} from "@/app/production/loading/actions";

// P2 CP1 — editor เที่ยวรถช่วง DRAFT (mobile-first): จุดส่งเป็นการ์ดเรียงตาม seq มีปุ่ม ▲▼/ลบ
// รายการสินค้าต่อจุดเลือกจาก FRESH picker (server กรองออเดอร์ยกเลิกให้แล้ว) — ทุกปุ่มยิง server
// action รายตัวพร้อม version ปัจจุบัน (CAS ฝั่ง server) แล้ว router.refresh() รับค่าใหม่

export type TripEditorData = {
  tripId: string;
  version: number;
  header: { tripDate: string; vehicleNote: string; note: string };
  drops: {
    id: string;
    seq: number;
    customerId: string;
    branchId: string | null;
    customerName: string;
    branchName: string | null;
    note: string | null;
    lines: {
      id: string;
      label: string;
      sku: string | null;
      size: string | null;
      qtyPlanned: number;
      customerPoLineId: string | null;
      /** ยอดที่บรรทัดต้นทางเดียวกันถูกวางแผนไว้ในเที่ยว active อื่น (บริบทกัน duplicate) */
      plannedElsewhere: number;
    }[];
  }[];
  customers: { id: string; name: string; branches: { id: string; name: string }[] }[];
  eligibleByCustomer: Record<
    string,
    {
      id: string;
      label: string;
      sku: string | null;
      size: string | null;
      qtyCurrent: number;
      sourceBranchId: string | null;
      sourceBranchName: string | null;
      plannedElsewhere: number;
      poInfo: string;
    }[]
  >;
};

export function LoadingTripEditor({ data }: { data: TripEditorData }) {
  const [editHeader, setEditHeader] = useState(false);
  const [addingDrop, setAddingDrop] = useState(false);
  const [dropCustomerId, setDropCustomerId] = useState("");
  const [dropBranchId, setDropBranchId] = useState("");
  const [dropNote, setDropNote] = useState("");
  // add-line state ต่อ drop (เปิดฟอร์มได้ทีละจุด)
  const [addingLineDropId, setAddingLineDropId] = useState<string | null>(null);
  const [lineChoice, setLineChoice] = useState("");
  const [lineQty, setLineQty] = useState("");
  // CP2 lock 3 — default โชว์เฉพาะออเดอร์สาขาเดียวกับจุดส่ง ส่งข้ามสาขาต้องกดเปิดเอง
  // (explicit override + warning) — ไม่มีการเขียนทับสาขาต้นทางใดๆ
  const [showOtherBranch, setShowOtherBranch] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

  function run(action: () => Promise<ActionResult>) {
    if (isPending) return;
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) {
          showError(result.error);
          return;
        }
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  function fd(entries: Record<string, string>): FormData {
    const formData = new FormData();
    formData.set("version", String(data.version));
    for (const [k, v] of Object.entries(entries)) formData.set(k, v);
    return formData;
  }

  const selectedCustomer = data.customers.find((c) => c.id === dropCustomerId);

  return (
    <div className="space-y-4">
      {/* หัวเที่ยว */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-gray-700">ข้อมูลเที่ยว</h2>
          <button type="button" onClick={() => setEditHeader((v) => !v)} className="text-xs text-blue-700 hover:underline">
            {editHeader ? "ปิดการแก้ไข" : "แก้ไขข้อมูลเที่ยว"}
          </button>
        </div>
        {editHeader && (
          <LoadingTripHeaderForm
            action={updateLoadingTripHeader.bind(null, data.tripId)}
            initial={data.header}
            version={data.version}
            submitLabel="บันทึกข้อมูลเที่ยว"
            onDone={() => setEditHeader(false)}
          />
        )}
      </div>

      {/* จุดส่ง */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-gray-700">จุดส่ง ({data.drops.length})</h2>
          <button
            type="button"
            onClick={() => setAddingDrop((v) => !v)}
            className="text-xs px-2 py-1 rounded-lg border border-cp-navy text-cp-navy hover:bg-cp-navy/5 font-medium"
          >
            {addingDrop ? "ปิด" : "+ เพิ่มจุดส่ง"}
          </button>
        </div>

        {addingDrop && (
          <div className="bg-white border rounded-lg p-3 mb-2 space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า *</label>
              <select
                value={dropCustomerId}
                onChange={(e) => {
                  setDropCustomerId(e.target.value);
                  setDropBranchId("");
                }}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">— เลือกลูกค้า —</option>
                {data.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedCustomer && selectedCustomer.branches.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">สาขา (ถ้ามี)</label>
                <select value={dropBranchId} onChange={(e) => setDropBranchId(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">— ไม่ระบุสาขา —</option>
                  {selectedCustomer.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุจุดส่ง</label>
              <input value={dropNote} onChange={(e) => setDropNote(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <button
              type="button"
              disabled={isPending || !dropCustomerId}
              onClick={() =>
                run(async () => {
                  const result = await addLoadingDrop(data.tripId, fd({ customerId: dropCustomerId, branchId: dropBranchId, note: dropNote }));
                  if (result.success) {
                    setDropCustomerId("");
                    setDropBranchId("");
                    setDropNote("");
                    setAddingDrop(false);
                  }
                  return result;
                })
              }
              className="w-full bg-cp-navy hover:bg-cp-navy-light disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
            >
              เพิ่มจุดส่ง
            </button>
          </div>
        )}

        {data.drops.length === 0 && !addingDrop && (
          <div className="bg-white border border-dashed rounded-lg p-4 text-sm text-gray-500 text-center">ยังไม่มีจุดส่ง — กด &quot;+ เพิ่มจุดส่ง&quot;</div>
        )}

        <div className="space-y-2">
          {data.drops.map((drop, idx) => {
            const allOptions = data.eligibleByCustomer[drop.customerId] ?? [];
            // default: เฉพาะออเดอร์สาขาเดียวกับจุดส่งนี้ (null ต้องตรง null ด้วย) — toggle เปิดสาขาอื่น
            const sameBranch = allOptions.filter((o) => o.sourceBranchId === drop.branchId);
            const otherBranch = allOptions.filter((o) => o.sourceBranchId !== drop.branchId);
            const options = showOtherBranch ? allOptions : sameBranch;
            const chosen = options.find((o) => o.id === lineChoice);
            const chosenInThisTrip = chosen
              ? data.drops.reduce((s, d) => s + d.lines.filter((l) => l.customerPoLineId === chosen.id).reduce((x, l) => x + l.qtyPlanned, 0), 0)
              : 0;
            return (
              <div key={drop.id} className="bg-white border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      disabled={isPending || idx === 0}
                      onClick={() => run(() => moveLoadingDrop(data.tripId, drop.id, fd({ direction: "up" })))}
                      className="text-gray-400 hover:text-cp-navy disabled:opacity-20 text-xs leading-none"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={isPending || idx === data.drops.length - 1}
                      onClick={() => run(() => moveLoadingDrop(data.tripId, drop.id, fd({ direction: "down" })))}
                      className="text-gray-400 hover:text-cp-navy disabled:opacity-20 text-xs leading-none"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {idx + 1}. {drop.customerName}
                      {drop.branchName && <span className="text-gray-500"> — {drop.branchName}</span>}
                    </div>
                    {drop.note && <div className="text-xs text-gray-500">{drop.note}</div>}
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => removeLoadingDrop(data.tripId, drop.id, fd({})))}
                    className="text-gray-400 hover:text-red-600 text-sm px-1 shrink-0"
                    title="ลบจุดส่งนี้ (รวมรายการในจุด)"
                  >
                    ×
                  </button>
                </div>

                {/* รายการของจุดนี้ */}
                <div className="mt-2 pl-6 space-y-1">
                  {drop.lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between gap-2 text-sm border-b border-dashed pb-1">
                      <span className="min-w-0">
                        {line.label}
                        {line.size && <span className="text-gray-500"> (ไซส์ {line.size})</span>}
                        {line.sku && <span className="text-xs text-gray-400 font-mono ml-1">{line.sku}</span>}
                        {line.plannedElsewhere > 0 && (
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            อยู่ในแผนเที่ยวอื่นด้วย {line.plannedElsewhere}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold">แผน {line.qtyPlanned}</span>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => run(() => removeLoadingLine(data.tripId, line.id, fd({})))}
                          className="text-gray-400 hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  ))}

                  {addingLineDropId === drop.id ? (
                    <div className="bg-gray-50 border rounded p-2 space-y-1.5 mt-1">
                      <select
                        value={lineChoice}
                        onChange={(e) => {
                          setLineChoice(e.target.value);
                          const opt = allOptions.find((o) => o.id === e.target.value);
                          if (opt) setLineQty(String(opt.qtyCurrent));
                        }}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="">— เลือกสินค้าจากออเดอร์ของลูกค้ารายนี้ —</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.sourceBranchId !== drop.branchId ? "⚠ " : ""}
                            {o.label}
                            {o.size ? ` (${o.size})` : ""} · สั่ง {o.qtyCurrent}
                            {o.plannedElsewhere > 0 ? ` · แผนไว้เที่ยวอื่นแล้ว ${o.plannedElsewhere}` : ""} · {o.poInfo}
                            {o.sourceBranchId !== drop.branchId ? ` · สาขาต้นทาง: ${o.sourceBranchName ?? "ไม่ระบุ"}` : ""}
                          </option>
                        ))}
                      </select>
                      {otherBranch.length > 0 && (
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                          <input type="checkbox" checked={showOtherBranch} onChange={(e) => setShowOtherBranch(e.target.checked)} className="rounded" />
                          แสดงออเดอร์สาขาอื่นของลูกค้ารายนี้ ({otherBranch.length} รายการ)
                        </label>
                      )}
                      {options.length === 0 && (
                        <p className="text-xs text-gray-500">
                          {sameBranch.length === 0 && otherBranch.length > 0
                            ? "ไม่มีออเดอร์ของสาขาเดียวกับจุดส่งนี้ — ติ๊ก \"แสดงออเดอร์สาขาอื่น\" ถ้าต้องการส่งข้ามสาขา"
                            : "ลูกค้ารายนี้ไม่มีรายการที่พร้อมขึ้นรถ (ออเดอร์อาจถูกยกเลิกหรือยังไม่มีออเดอร์)"}
                        </p>
                      )}
                      {chosen && chosen.sourceBranchId !== drop.branchId && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          ⚠ ออเดอร์นี้เป็นของสาขา &quot;{chosen.sourceBranchName ?? "ไม่ระบุ"}&quot; ต่างจากจุดส่งนี้ — ระบบจะจดที่มาตามสาขาต้นทางเดิม ไม่เปลี่ยนให้
                        </p>
                      )}
                      {chosen && (chosen.plannedElsewhere > 0 || chosenInThisTrip > 0) && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          ⚠ รายการนี้ถูกวางแผนไว้แล้ว{chosenInThisTrip > 0 ? ` ${chosenInThisTrip} ในเที่ยวนี้` : ""}
                          {chosen.plannedElsewhere > 0 ? ` ${chosen.plannedElsewhere} ในเที่ยวอื่น` : ""} (ยอดสั่งทั้งหมด {chosen.qtyCurrent}) —
                          แบ่งขึ้นหลายเที่ยว/หลายจุดได้ แต่ตรวจให้แน่ใจว่าไม่ใช่การเพิ่มซ้ำโดยไม่ตั้งใจ
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={lineQty}
                          onChange={(e) => setLineQty(e.target.value)}
                          placeholder="จำนวนที่จะขึ้น"
                          className="w-32 border rounded px-2 py-1.5 text-sm"
                        />
                        {chosen && <span className="text-xs text-gray-500">ยอดสั่งปัจจุบัน {chosen.qtyCurrent}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isPending || !lineChoice || !lineQty}
                          onClick={() =>
                            run(async () => {
                              const result = await addLoadingLine(data.tripId, drop.id, fd({ customerPoLineId: lineChoice, qtyPlanned: lineQty }));
                              if (result.success) {
                                setLineChoice("");
                                setLineQty("");
                                setAddingLineDropId(null);
                              }
                              return result;
                            })
                          }
                          className="flex-1 bg-cp-navy hover:bg-cp-navy-light disabled:opacity-50 text-white text-sm font-medium rounded px-3 py-1.5"
                        >
                          เพิ่มรายการ
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingLineDropId(null);
                            setLineChoice("");
                            setLineQty("");
                          }}
                          className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50"
                        >
                          ปิด
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingLineDropId(drop.id);
                        setLineChoice("");
                        setLineQty("");
                      }}
                      className="text-xs text-cp-navy hover:underline mt-1"
                    >
                      + เพิ่มรายการในจุดนี้
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
