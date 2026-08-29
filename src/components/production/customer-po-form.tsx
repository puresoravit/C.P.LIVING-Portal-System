"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import {
  ProductSearchPicker,
  type PickedProduct,
  type ModelResult,
  type UnresolvedSizeInfo,
} from "@/components/product-search-picker";
import { ModelSizeSelect, type ModelSizeResolution } from "@/components/model-size-select";
import type { ActionResult } from "@/lib/action-result";

// Production Module (P1/S2) — ฟอร์มรับ P.O. ลูกค้า (CustomerPO) mobile-first: การ์ดต่อ
// บรรทัด ไม่ใช่ตารางแน่น — คุม State ทั้งหมดใน React component เดียว (ต่างจาก Pattern
// ของ Billing ที่แยกหัวเอกสาร Server-rendered+inline script ออกจาก React item entry
// เพราะที่นี่ header+lines ส่งเป็นก้อนเดียวพร้อมกัน ไม่ใช่ 2 ขั้นแบบ Billing Order)
type CustomerOption = {
  id: string;
  code: string;
  companyName: string;
  branches: { id: string; name: string }[];
};

type LineDraft = {
  key: number;
  // S2 Checkpoint 2 — id = CustomerPOLine.id จริงถ้าเป็นบรรทัดเดิม (โหมดแก้ไข), null =
  // บรรทัดใหม่ (สร้างใหม่ หรือเพิ่มระหว่างแก้ไข) ต่างจาก key ที่เป็นแค่ React reconciliation
  // ล้วนๆ — id นี้เองที่ทำให้ updateCustomerPO ตัดสินได้ว่าบรรทัดไหนแก้/เพิ่ม/ลบ
  id: string | null;
  lineKind: "CATALOG" | "UNRESOLVED";
  productId: string | null;
  productLabel: string; // แสดงผลเท่านั้น
  rawProductText: string;
  size: string;
  qtyCurrent: string;
  urgency: boolean;
  requiredDate: string;
  note: string;
  // UI-only (ไม่ส่งเข้า server) — รอผู้ใช้เลือกไซส์จาก ModelSizeSelect เมื่อสินค้าที่ค้นเจอ
  // เป็นตระกูล/รุ่นที่มีมากกว่า 1 ไซส์ (Bug ที่แก้: เดิมไม่มี field นี้เลย ทำให้สินค้าแบบนี้
  // เลือกไม่ได้ทุกตัว ไม่ใช่แค่ David)
  selectedModel: ModelResult | null;
  // S4 UAT (2026-08-29) — UI grouping เท่านั้น: บรรทัดที่ groupKey เดียวกันแสดงเป็น card
  // เดียว (เลือกสินค้า/รุ่นครั้งเดียว เพิ่มได้หลายไซส์+จำนวนใน card) — canonical ยังเป็น
  // 1 LineDraft = 1 CustomerPOLine ต่อ SKU/ไซส์เหมือนเดิมเป๊ะ submit/validation ไม่เปลี่ยน
  groupKey: number;
};

let keySeq = 0;
function emptyLine(overrides?: Partial<Omit<LineDraft, "key">>): LineDraft {
  keySeq += 1;
  return {
    key: keySeq,
    id: null,
    lineKind: "CATALOG",
    productId: null,
    productLabel: "",
    rawProductText: "",
    size: "",
    qtyCurrent: "1",
    urgency: false,
    requiredDate: "",
    note: "",
    selectedModel: null,
    groupKey: keySeq,
    ...overrides,
  };
}

// S2 Checkpoint 2 — ข้อมูลตั้งต้นตอนแก้ไข (Server Component ประกอบมาให้แล้ว รวม
// productLabel ที่ resolve จาก productionLabel/name เรียบร้อย) id/version ใช้คู่กับ
// Optimistic Lock (compare-and-swap บน CustomerPO.version)
export type CustomerPOFormInitial = {
  id: string;
  version: number;
  customerId: string;
  branchId: string;
  dateMode: "UNSET" | "ESTIMATE" | "EXACT";
  requestedDate: string;
  urgency: boolean;
  lines: {
    id: string;
    lineKind: "CATALOG" | "UNRESOLVED";
    productId: string | null;
    productLabel: string;
    rawProductText: string;
    size: string;
    qtyCurrent: number;
    urgency: boolean;
    requiredDate: string;
    note: string;
  }[];
};

export function CustomerPOForm({
  customers,
  action,
  initial,
}: {
  customers: CustomerOption[];
  action: (formData: FormData) => Promise<ActionResult | void>;
  /** ให้มา = โหมดแก้ไข (มีช่องเหตุผล + ส่ง version ไปด้วยสำหรับ Optimistic Lock) —
   * ไม่ให้มา = โหมดสร้างใหม่ */
  initial?: CustomerPOFormInitial;
}) {
  const isEdit = !!initial;
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [branchId, setBranchId] = useState(initial?.branchId ?? "");
  const [dateMode, setDateMode] = useState<"UNSET" | "ESTIMATE" | "EXACT">(initial?.dateMode ?? "UNSET");
  const [requestedDate, setRequestedDate] = useState(initial?.requestedDate ?? "");
  const [urgency, setUrgency] = useState(initial?.urgency ?? false);
  const [reason, setReason] = useState("");
  // Bug fix — ต้องเป็น Lazy Initializer (function) ไม่ใช่ Eager ([emptyLine()]) เพราะ
  // React เรียก Argument ของ useState "ทุก Render" (แค่ใช้ผลแค่ครั้งแรก) — เดิม
  // emptyLine() เลยถูกเรียกซ้ำทุกครั้งที่ Component Re-render โดยไม่จำเป็น เพิ่ม
  // module-level keySeq เปล่าๆ ทิ้ง (ไม่ทำให้ key ชนกันเพราะ keySeq เพิ่มทางเดียว แต่เป็น
  // React Anti-pattern ที่ต้องแก้ให้ถูกต้อง ไม่ควรมี Side Effect ระหว่าง Render เลย)
  const [lines, setLines] = useState<LineDraft[]>(() =>
    initial
      ? initial.lines.map((l) =>
          emptyLine({
            id: l.id,
            lineKind: l.lineKind,
            productId: l.productId,
            productLabel: l.productLabel,
            rawProductText: l.rawProductText,
            size: l.size,
            qtyCurrent: String(l.qtyCurrent),
            urgency: l.urgency,
            requiredDate: l.requiredDate,
            note: l.note,
          })
        )
      : [emptyLine()]
  );
  const [err, setErr] = useState("");
  // เพิ่มเพื่อ Pinpoint ว่าบรรทัดไหนจริงๆ ที่ validation ไม่ผ่าน (ไฮไลต์กรอบแดงตรงบรรทัด
  // แทนข้อความรวมบนสุดอย่างเดียว) — เคลียร์ทันทีที่บรรทัดนั้นถูกแก้ไข
  const [invalidLineKeys, setInvalidLineKeys] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);
  const { showError } = useToast();

  if (thrownError) throw thrownError;

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    // เคลียร์ Error ไฮไลต์ของบรรทัดนี้ทันทีที่แก้ (Pattern เดียวกับ clearFieldError ใน
    // FieldErrorsContext — แก้แล้ว Error เก่าควรหายทันที ไม่ต้องรอกด Submit ใหม่)
    setInvalidLineKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  // S4 UAT — เพิ่ม "ไซส์+จำนวน" อีกแถวใน card เดียวกัน (สินค้า/รุ่นเดียวกัน ไม่ต้องค้นหาซ้ำ):
  // แถวใหม่ copy บริบทของ card (selectedModel สำหรับตระกูล / rawProductText สำหรับพิมพ์เอง)
  // แล้วแทรกต่อท้ายสมาชิกเดิมของกลุ่ม — canonical ยัง 1 แถว = 1 CustomerPOLine เหมือนเดิม
  function addSizeRow(leader: LineDraft) {
    setLines((prev) => {
      const lastIdx = prev.map((l) => l.groupKey).lastIndexOf(leader.groupKey);
      const newRow = emptyLine({
        groupKey: leader.groupKey,
        lineKind: leader.lineKind,
        selectedModel: leader.selectedModel,
        rawProductText: leader.lineKind === "UNRESOLVED" ? leader.rawProductText : "",
      });
      return [...prev.slice(0, lastIdx + 1), newRow, ...prev.slice(lastIdx + 1)];
    });
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function handlePick(key: number, p: PickedProduct) {
    updateLine(key, {
      lineKind: "CATALOG",
      productId: p.id,
      productLabel: p.size ? `${p.name} (${p.size})` : p.name,
      size: p.size ?? "",
      rawProductText: "",
      selectedModel: null,
    });
  }

  // เรียกเมื่อค้นเจอ "รุ่น/ตระกูลสินค้า" ที่มีมากกว่า 1 ไซส์ (เช่น David) — Picker เองไม่
  // เรนเดอร์ตัวเลือกไซส์ ส่งต่อให้ parent เรนเดอร์ <ModelSizeSelect> เอง (Pattern เดียวกับ
  // manual-tax-invoice-item-entry.tsx) — ไม่มี handler นี้มาก่อนคือ Root Cause ของบั๊ก
  function handleModelSelected(key: number, model: ModelResult | null) {
    updateLine(key, { selectedModel: model });
  }

  // ไซส์ที่เลือกยังไม่มี Product จริงรองรับ (Standard ที่ยังไม่ตั้งราคา หรือ "ขนาดพิเศษ") —
  // ไม่มี productId ให้ผูก ตรงกับความหมาย UNRESOLVED ของ CustomerPOLine พอดี
  function handleUnresolvedSize(key: number, info: UnresolvedSizeInfo | null) {
    if (!info) return;
    updateLine(key, {
      lineKind: "UNRESOLVED",
      productId: null,
      productLabel: "",
      rawProductText: `${info.modelName}${info.custom ? "" : ` (${info.size})`} — ไซส์นี้ยังไม่มีในระบบ`,
      size: info.custom ? "" : info.size,
      selectedModel: null,
    });
  }

  function handleSizeResolve(key: number, result: ModelSizeResolution) {
    if (!result) return;
    if ("picked" in result) {
      const p = result.picked;
      // ต่างจาก handlePick (direct pick): คง selectedModel ไว้ — card ตระกูลนี้ยังต้องใช้
      // model เดิมสำหรับ "+ เพิ่มไซส์" แถวถัดไป และปุ่ม × ของแถวที่ resolve แล้วจะพากลับไป
      // เลือกไซส์ใหม่ได้โดยไม่ต้องค้นหารุ่นซ้ำ
      updateLine(key, {
        lineKind: "CATALOG",
        productId: p.id,
        productLabel: p.size ? `${p.name} (${p.size})` : p.name,
        size: p.size ?? "",
        rawProductText: "",
      });
    } else {
      handleUnresolvedSize(key, result.unresolved);
    }
  }

  // แก้ชื่อสินค้า (พิมพ์เอง) ของ card UNRESOLVED — sync ไปทุกแถวไซส์ในกลุ่มเดียวกัน
  // (ชื่อเดียวกันทั้ง card ตาม UX grouping — แต่ละแถวยังเป็นคนละ CustomerPOLine ตอน submit)
  function updateGroupRawText(groupKey: number, text: string) {
    setLines((prev) => prev.map((l) => (l.groupKey === groupKey && l.lineKind === "UNRESOLVED" ? { ...l, rawProductText: text } : l)));
    setInvalidLineKeys((prev) => {
      const memberKeys = lines.filter((l) => l.groupKey === groupKey).map((l) => l.key);
      if (!memberKeys.some((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      for (const k of memberKeys) next.delete(k);
      return next;
    });
  }

  function toggleUnresolved(key: number, unresolved: boolean) {
    updateLine(key, {
      lineKind: unresolved ? "UNRESOLVED" : "CATALOG",
      productId: null,
      productLabel: "",
      rawProductText: "",
      selectedModel: null,
    });
  }

  // คืนทั้ง "บรรทัดไหนผิด" (สำหรับไฮไลต์ตรงจุด) และข้อความสรุป — เดิม return แค่ string
  // เดียว บอกไม่ได้ว่าบรรทัดไหนจริงๆ ที่ตก ทำให้ตรวจสอบ Bug Report ที่บอกว่า "เลือกสินค้า
  // แล้วแต่ validation ยังฟ้อง" ไม่ได้ว่าเป็น State ไม่ Sync จริง หรือมีบรรทัดว่างที่ไม่ทันสังเกต
  function findInvalidLines(): { invalidKeys: Set<number>; message: string } | null {
    if (!customerId) return { invalidKeys: new Set(), message: "กรุณาเลือกลูกค้า" };
    if (isEdit && !reason.trim()) return { invalidKeys: new Set(), message: "กรุณากรอกเหตุผลที่แก้ไข" };
    const invalidKeys = new Set<number>();
    for (const l of lines) {
      const qty = Number(l.qtyCurrent);
      const qtyInvalid = !Number.isFinite(qty) || qty <= 0;
      const productInvalid = l.lineKind === "CATALOG" ? !l.productId : !l.rawProductText.trim();
      if (qtyInvalid || productInvalid) invalidKeys.add(l.key);
    }
    if (invalidKeys.size === 0) return null;
    return {
      invalidKeys,
      message: `กรุณาแก้ไข ${invalidKeys.size} รายการที่ไฮไลต์กรอบแดงด้านล่าง (เลือกสินค้า/กรอกชื่อ และกรอกจำนวนให้ถูกต้อง)`,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    const invalid = findInvalidLines();
    if (invalid) {
      setErr(invalid.message);
      setInvalidLineKeys(invalid.invalidKeys);
      return;
    }
    setErr("");
    setInvalidLineKeys(new Set());

    const formData = new FormData();
    formData.set("customerId", customerId);
    formData.set("branchId", branchId);
    formData.set("dateMode", dateMode);
    formData.set("requestedDate", requestedDate);
    formData.set("urgency", urgency ? "1" : "0");
    if (isEdit) {
      formData.set("version", String(initial!.version));
      formData.set("reason", reason);
    }
    formData.set(
      "linesJson",
      JSON.stringify(
        lines.map((l) => ({
          id: l.id ?? undefined,
          lineKind: l.lineKind,
          productId: l.lineKind === "CATALOG" ? l.productId ?? undefined : undefined,
          rawProductText: l.lineKind === "UNRESOLVED" ? l.rawProductText.trim() : undefined,
          size: l.size || undefined,
          qtyCurrent: Number(l.qtyCurrent),
          urgency: l.urgency,
          requiredDate: l.requiredDate || undefined,
          note: l.note || undefined,
        }))
      )
    );

    startTransition(async () => {
      try {
        const result = await action(formData);
        // createCustomerPO/updateCustomerPO เรียก redirect() เมื่อสำเร็จ — ถ้ามาถึงตรงนี้
        // พร้อม result แปลว่าเป็น validation/concurrency error ที่ตั้งใจคืนกลับมา (ไม่ throw)
        if (result && !result.success) {
          showError(result.error);
        }
      } catch (error) {
        unstable_rethrow(error); // ปล่อย redirect() signal ผ่านไปให้ Next.js จัดการ
        setThrownError(error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* หัวเอกสาร — มือถือ: เรียงเป็นคอลัมน์เดียว, sm ขึ้นไป: 2 คอลัมน์ */}
      <div className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า *</label>
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setBranchId("");
            }}
            required
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="" disabled>
              เลือกลูกค้า
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">สาขา (ถ้ามี)</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={!selectedCustomer || selectedCustomer.branches.length === 0}
            className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">{selectedCustomer && selectedCustomer.branches.length === 0 ? "ลูกค้ารายนี้ยังไม่มีสาขา" : "— ไม่ระบุสาขา —"}</option>
            {selectedCustomer?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ต้องการ</label>
          <select value={dateMode} onChange={(e) => setDateMode(e.target.value as typeof dateMode)} className="w-full border rounded px-3 py-2 text-sm">
            <option value="UNSET">ยังไม่กำหนด</option>
            <option value="ESTIMATE">ประมาณ</option>
            <option value="EXACT">ระบุชัด</option>
          </select>
        </div>
        {dateMode !== "UNSET" && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ต้องการ (โดยประมาณ/ชัดเจน)</label>
            <input
              type="date"
              value={requestedDate}
              onChange={(e) => setRequestedDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        )}
        <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
          <input id="poUrgency" type="checkbox" checked={urgency} onChange={(e) => setUrgency(e.target.checked)} className="rounded" />
          <label htmlFor="poUrgency" className="text-sm text-gray-700">
            ออเดอร์นี้เร่งด่วน
          </label>
        </div>
      </div>

      {/* รายการ — จัดกลุ่มเป็น card ต่อสินค้า/รุ่น (S4 UAT): บรรทัดที่ groupKey เดียวกันอยู่
          card เดียว เลือกสินค้าครั้งเดียวแล้วเพิ่มได้หลายไซส์+จำนวน — canonical ยังเป็น
          1 แถว = 1 CustomerPOLine ต่อ SKU/ไซส์เหมือนเดิม (submit/validation ไม่เปลี่ยนเลย) */}
      <div className="space-y-3">
        {(() => {
          const cards: LineDraft[][] = [];
          const byGroup = new Map<number, LineDraft[]>();
          for (const l of lines) {
            if (!byGroup.has(l.groupKey)) {
              const arr: LineDraft[] = [];
              byGroup.set(l.groupKey, arr);
              cards.push(arr);
            }
            byGroup.get(l.groupKey)!.push(l);
          }
          return cards.map((card, cardIdx) => {
            const leader = card[0];
            const cardInvalid = card.some((l) => invalidLineKeys.has(l.key));
            const canAddSize =
              (leader.lineKind === "CATALOG" && !!leader.selectedModel) ||
              (leader.lineKind === "UNRESOLVED" && !!leader.rawProductText.trim());
            return (
              <div key={leader.groupKey} className={`bg-white border rounded-lg p-3 space-y-2 ${cardInvalid ? "border-red-400 bg-red-50/40" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${cardInvalid ? "text-red-600" : "text-gray-500"}`}>
                    รายการที่ {cardIdx + 1}
                    {card.length > 1 && ` (${card.length} ไซส์)`}
                    {cardInvalid && " — กรุณาแก้ไขแถวที่ไฮไลต์"}
                  </span>
                  <div className="flex items-center gap-3">
                    {card.length === 1 && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={leader.lineKind === "UNRESOLVED"}
                          onChange={(e) => toggleUnresolved(leader.key, e.target.checked)}
                          className="rounded"
                        />
                        พิมพ์ชื่อเอง (ยังไม่มีในระบบ)
                      </label>
                    )}
                    {card.length === 1 && lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(leader.key)} className="text-xs text-gray-400 hover:text-red-600">
                        ลบ
                      </button>
                    )}
                  </div>
                </div>

                {leader.lineKind === "CATALOG" ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">สินค้า *</label>
                    {leader.productId && card.length === 1 ? (
                      <div className="flex items-center justify-between border rounded px-3 py-2 text-sm bg-gray-50">
                        <span>{leader.productLabel}</span>
                        <button
                          type="button"
                          onClick={() => updateLine(leader.key, { productId: null, productLabel: "", size: "" })}
                          className="text-gray-400 hover:text-gray-700"
                        >
                          ×
                        </button>
                      </div>
                    ) : leader.selectedModel ? (
                      // ตระกูล/รุ่นถูกเลือกแล้ว — ค้างไว้เป็นบริบทของทั้ง card (เพิ่มไซส์ได้
                      // เรื่อยๆ ด้านล่าง โดยไม่ต้องค้นหาซ้ำ) × = เปลี่ยนสินค้าทั้ง card
                      <div className="flex items-center justify-between border rounded px-3 py-2 text-sm bg-gray-50">
                        <span>
                          {leader.selectedModel.modelName}
                          <span className="text-xs text-gray-400 ml-1.5">— เลือกไซส์และจำนวนด้านล่าง</span>
                        </span>
                        {card.length === 1 && (
                          <button
                            type="button"
                            onClick={() => updateLine(leader.key, { selectedModel: null, productId: null, productLabel: "", size: "" })}
                            className="text-gray-400 hover:text-gray-700"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ) : leader.productId ? (
                      <div className="border rounded px-3 py-2 text-sm bg-gray-50">{leader.productLabel}</div>
                    ) : (
                      <ProductSearchPicker
                        customerId={customerId || undefined}
                        onPick={(p) => handlePick(leader.key, p)}
                        onModelSelected={(m) => handleModelSelected(leader.key, m)}
                        onUnresolvedSize={(info) => handleUnresolvedSize(leader.key, info)}
                        onClear={() => updateLine(leader.key, { selectedModel: null, size: "" })}
                        placeholder="ค้นหาสินค้า/รุ่น..."
                      />
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อสินค้าที่ลูกค้าสั่ง (ยังไม่มีในระบบ) *</label>
                    <input
                      value={leader.rawProductText}
                      onChange={(e) => updateGroupRawText(leader.groupKey, e.target.value)}
                      placeholder="พิมพ์ตามที่ลูกค้าเขียน/บอกมา"
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {card.map((line, rowIdx) => {
                    const rowInvalid = invalidLineKeys.has(line.key);
                    return (
                      <div
                        key={line.key}
                        className={`space-y-2 ${card.length > 1 ? `border rounded-lg p-2 ${rowInvalid ? "border-red-400 bg-red-50/60" : "border-gray-200"}` : ""}`}
                      >
                        {card.length > 1 && (
                          <div className="flex items-center justify-between">
                            <span className={`text-xs ${rowInvalid ? "text-red-600 font-medium" : "text-gray-500"}`}>
                              ไซส์ที่ {rowIdx + 1}
                              {line.lineKind === "CATALOG" && line.productId && ` — ${line.productLabel}`}
                              {line.lineKind === "CATALOG" && !line.productId && " — ยังไม่เลือกไซส์"}
                              {rowInvalid && " (แก้ไขแถวนี้)"}
                            </span>
                            <div className="flex items-center gap-2">
                              {line.lineKind === "CATALOG" && line.productId && line.selectedModel && (
                                <button
                                  type="button"
                                  onClick={() => updateLine(line.key, { productId: null, productLabel: "", size: "" })}
                                  className="text-xs text-gray-400 hover:text-gray-700"
                                  title="เลือกไซส์ใหม่"
                                >
                                  เปลี่ยนไซส์
                                </button>
                              )}
                              {lines.length > 1 && (
                                <button type="button" onClick={() => removeLine(line.key)} className="text-xs text-gray-400 hover:text-red-600">
                                  ลบไซส์นี้
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className={`grid grid-cols-2 gap-2 ${line.urgency ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">ไซส์</label>
                            {/* เลือก "รุ่น" ที่มีมากกว่า 1 ไซส์ (เช่น David) → ต้องเลือกไซส์จาก
                                ตัวเลือกจริงของรุ่นนั้น — selectedModel คงอยู่หลัง resolve แล้ว
                                (S4 UAT: card ใช้ต่อสำหรับเพิ่มไซส์) จึงเช็ค !productId ด้วย */}
                            {!line.productId && line.selectedModel ? (
                              <ModelSizeSelect model={line.selectedModel} onResolve={(r) => handleSizeResolve(line.key, r)} />
                            ) : (
                              <input
                                value={line.size}
                                onChange={(e) => updateLine(line.key, { size: e.target.value })}
                                placeholder="เช่น 5 ฟุต"
                                className="w-full border rounded px-3 py-2 text-sm"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">จำนวน *</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={line.qtyCurrent}
                              onChange={(e) => updateLine(line.key, { qtyCurrent: e.target.value })}
                              className="w-full border rounded px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="flex items-end pb-2">
                            <label className="flex items-center gap-1.5 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={line.urgency}
                                onChange={(e) => {
                                  const urgent = e.target.checked;
                                  // ปิดด่วน = กลับไป inherit วันที่ของ P.O. เสมอ ห้ามเก็บ override ค้าง
                                  updateLine(line.key, urgent ? { urgency: true } : { urgency: false, requiredDate: "" });
                                }}
                                className="rounded"
                              />
                              ด่วนรายการนี้
                            </label>
                          </div>
                          {/* ปกติ = inherit วันที่จาก P.O. อัตโนมัติ ไม่บังคับเลือกซ้ำทุกบรรทัด — เปิดช่อง
                              วันที่เฉพาะบรรทัดเมื่อติ๊ก "ด่วนรายการนี้" เท่านั้น ค่านี้ override เฉพาะ
                              บรรทัดนี้บรรทัดเดียว (ยืนยันตามที่ตกลง) */}
                          {line.urgency ? (
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ต้องการ (เฉพาะรายการนี้)</label>
                              <input
                                type="date"
                                value={line.requiredDate}
                                onChange={(e) => updateLine(line.key, { requiredDate: e.target.value })}
                                className="w-full border rounded px-3 py-2 text-sm"
                              />
                            </div>
                          ) : (
                            <div className="flex items-end pb-2">
                              <span className="text-xs text-gray-400">ตามวันที่ของออเดอร์</span>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
                          <input
                            value={line.note}
                            onChange={(e) => updateLine(line.key, { note: e.target.value })}
                            className="w-full border rounded px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {canAddSize && (
                  <button
                    type="button"
                    onClick={() => addSizeRow(leader)}
                    className="w-full border border-dashed rounded py-1.5 text-xs text-gray-500 hover:border-cp-navy hover:text-cp-navy"
                  >
                    + เพิ่มไซส์ของสินค้านี้
                  </button>
                )}
              </div>
            );
          });
        })()}
      </div>

      <button type="button" onClick={addLine} className="w-full border border-dashed rounded-lg py-2.5 text-sm text-gray-500 hover:border-cp-navy hover:text-cp-navy">
        + เพิ่มรายการ
      </button>

      {isEdit && (
        <div className="bg-white border rounded-lg p-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">เหตุผลที่แก้ไข *</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ลูกค้าโทรมาเพิ่มจำนวน, แก้ไซส์ผิด"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">บันทึกเป็นประวัติการแก้ไข (Rev.{initial!.version + 1}) — ดูย้อนหลังได้ในหน้ารายละเอียด</p>
        </div>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-cp-navy hover:bg-cp-navy-light disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-3"
      >
        {isPending ? "กำลังบันทึก..." : isEdit ? "บันทึกการแก้ไข" : "บันทึก P.O."}
      </button>
    </form>
  );
}
