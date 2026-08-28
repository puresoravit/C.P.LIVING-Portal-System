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
};

let keySeq = 0;
function emptyLine(): LineDraft {
  keySeq += 1;
  return {
    key: keySeq,
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
  };
}

export function CustomerPOForm({
  customers,
  createAction,
}: {
  customers: CustomerOption[];
  createAction: (formData: FormData) => Promise<ActionResult | void>;
}) {
  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [dateMode, setDateMode] = useState<"UNSET" | "ESTIMATE" | "EXACT">("UNSET");
  const [requestedDate, setRequestedDate] = useState("");
  const [urgency, setUrgency] = useState(false);
  // Bug fix — ต้องเป็น Lazy Initializer (function) ไม่ใช่ Eager ([emptyLine()]) เพราะ
  // React เรียก Argument ของ useState "ทุก Render" (แค่ใช้ผลแค่ครั้งแรก) — เดิม
  // emptyLine() เลยถูกเรียกซ้ำทุกครั้งที่ Component Re-render โดยไม่จำเป็น เพิ่ม
  // module-level keySeq เปล่าๆ ทิ้ง (ไม่ทำให้ key ชนกันเพราะ keySeq เพิ่มทางเดียว แต่เป็น
  // React Anti-pattern ที่ต้องแก้ให้ถูกต้อง ไม่ควรมี Side Effect ระหว่าง Render เลย)
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
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
    if ("picked" in result) handlePick(key, result.picked);
    else handleUnresolvedSize(key, result.unresolved);
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
    formData.set(
      "linesJson",
      JSON.stringify(
        lines.map((l) => ({
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
        const result = await createAction(formData);
        // createCustomerPO เรียก redirect() เมื่อสำเร็จ — ถ้ามาถึงตรงนี้พร้อม result
        // แปลว่าเป็น validation error ที่ตั้งใจคืนกลับมา (ไม่ throw)
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

      {/* รายการ — การ์ดต่อบรรทัด (มือถือ) ไม่ใช่ตารางแน่น */}
      <div className="space-y-3">
        {lines.map((line, idx) => {
          const isInvalid = invalidLineKeys.has(line.key);
          return (
          <div key={line.key} className={`bg-white border rounded-lg p-3 space-y-2 ${isInvalid ? "border-red-400 bg-red-50/40" : ""}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${isInvalid ? "text-red-600" : "text-gray-500"}`}>
                รายการที่ {idx + 1}
                {isInvalid && " — กรุณาแก้ไขบรรทัดนี้"}
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={line.lineKind === "UNRESOLVED"}
                    onChange={(e) => toggleUnresolved(line.key, e.target.checked)}
                    className="rounded"
                  />
                  พิมพ์ชื่อเอง (ยังไม่มีในระบบ)
                </label>
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(line.key)} className="text-xs text-gray-400 hover:text-red-600">
                    ลบ
                  </button>
                )}
              </div>
            </div>

            {line.lineKind === "CATALOG" ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">สินค้า *</label>
                {line.productId ? (
                  <div className="flex items-center justify-between border rounded px-3 py-2 text-sm bg-gray-50">
                    <span>{line.productLabel}</span>
                    <button
                      type="button"
                      onClick={() => updateLine(line.key, { productId: null, productLabel: "", size: "", selectedModel: null })}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <ProductSearchPicker
                    customerId={customerId || undefined}
                    onPick={(p) => handlePick(line.key, p)}
                    onModelSelected={(m) => handleModelSelected(line.key, m)}
                    onUnresolvedSize={(info) => handleUnresolvedSize(line.key, info)}
                    onClear={() => updateLine(line.key, { selectedModel: null, size: "" })}
                    placeholder="ค้นหาสินค้า/รุ่น..."
                  />
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อสินค้าที่ลูกค้าสั่ง (ยังไม่มีในระบบ) *</label>
                <input
                  value={line.rawProductText}
                  onChange={(e) => updateLine(line.key, { rawProductText: e.target.value })}
                  placeholder="พิมพ์ตามที่ลูกค้าเขียน/บอกมา"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className={`grid grid-cols-2 gap-2 ${line.urgency ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ไซส์</label>
                {/* เลือก "รุ่น" ที่มีมากกว่า 1 ไซส์ (เช่น David) → ต้องเลือกไซส์จากตัวเลือก
                    จริงของรุ่นนั้น ไม่ใช่พิมพ์เอง (Bug fix — ดู handleModelSelected ด้านบน) */}
                {line.selectedModel ? (
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

      <button type="button" onClick={addLine} className="w-full border border-dashed rounded-lg py-2.5 text-sm text-gray-500 hover:border-cp-navy hover:text-cp-navy">
        + เพิ่มรายการ
      </button>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-cp-navy hover:bg-cp-navy-light disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-3"
      >
        {isPending ? "กำลังบันทึก..." : "บันทึก P.O."}
      </button>
    </form>
  );
}
