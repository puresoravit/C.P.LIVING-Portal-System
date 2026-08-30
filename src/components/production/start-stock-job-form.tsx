"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// CP6 — ฟอร์มเริ่มรายการขึ้นของแบบไม่มีใบสั่งผลิต (ของจากสต็อก/งานกะทันหัน): เลือกลูกค้า
// ปลายทาง + รอบจัดส่ง (ใหม่/เข้ารอบเดิม) — รายการสินค้าไปเพิ่มที่หน้าเตรียมขึ้นของ
export function StartStockJobForm({
  customers,
  openRuns,
  action,
}: {
  customers: { id: string; name: string; branches: { id: string; name: string }[] }[];
  openRuns: { id: string; label: string }[];
  action: (formData: FormData) => Promise<ActionResult & { tripId?: string }>;
}) {
  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [tripId, setTripId] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

  const selectedCustomer = customers.find((c) => c.id === customerId);

  function handleSubmit() {
    if (isPending) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("customerId", customerId);
        formData.set("branchId", branchId);
        formData.set("mode", mode);
        if (mode === "existing") formData.set("tripId", tripId);
        const result = await action(formData);
        if (!result.success) {
          showError(result.error);
          router.refresh();
          return;
        }
        router.push(`/production/loading/${result.tripId}`);
      } catch (error) {
        unstable_rethrow(error);
        showError("บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้าปลายทาง *</label>
        <select
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setBranchId("");
          }}
          className="w-full border rounded px-3 py-2 text-sm"
        >
          <option value="">— เลือกลูกค้า —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {selectedCustomer && selectedCustomer.branches.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">สาขา (ถ้ามี)</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
            <option value="">— ไม่ระบุสาขา —</option>
            {selectedCustomer.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {openRuns.length > 0 && (
        <div className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="stock-run-mode" checked={mode === "new"} onChange={() => setMode("new")} />
            เริ่มรอบจัดส่งใหม่
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="stock-run-mode" checked={mode === "existing"} onChange={() => setMode("existing")} />
            เพิ่มเข้ารอบจัดส่งเดิมที่ยังเปิดอยู่
          </label>
          {mode === "existing" && (
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">— เลือกรอบจัดส่ง —</option>
              {openRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={isPending || !customerId || (mode === "existing" && !tripId)}
        onClick={handleSubmit}
        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2.5"
      >
        {isPending ? "กำลังบันทึก..." : "เริ่มรายการขึ้นของ"}
      </button>
    </div>
  );
}
