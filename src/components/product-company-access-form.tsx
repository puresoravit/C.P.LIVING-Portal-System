"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";

// ==========================================================================
// R8 (2026-08-26) — Product Assignment ตามบริษัทลูกค้า: ฟอร์มเลือกบริษัทที่เปิดให้ใช้
// สินค้า Family นี้ — ใช้ร่วมกันทั้งหน้า Product (Standalone/Anchor) และหน้า ProductModel
// (Action ต่างกัน ส่งเข้ามาเป็น Prop — Logic ตัดสินใจจริงอยู่ฝั่ง Server เสมอ)
// ไม่ติ๊กเลย = สินค้าส่วนกลาง ทุกบริษัทใช้ได้ (Default ของสินค้าทุกตัว)
// ==========================================================================

export function ProductCompanyAccessForm({
  customers,
  initialCustomerIds,
  action,
}: {
  customers: { id: string; companyName: string; code: string }[];
  initialCustomerIds: string[];
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initialCustomerIds));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify([...checked].sort()) !== JSON.stringify([...initialCustomerIds].sort());

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMessage(null);
  }

  function save() {
    const fd = new FormData();
    for (const id of checked) fd.append("customerIds", id);
    startTransition(async () => {
      const result = await action(fd);
      if (result.success) {
        setMessage({ ok: true, text: result.message ?? "บันทึกการกำหนดบริษัทสำเร็จ" });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error ?? "เกิดข้อผิดพลาด" });
      }
    });
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <h2 className="text-sm font-semibold mb-1">บริษัทลูกค้าที่ใช้สินค้านี้ได้</h2>
      <p className="text-xs text-gray-500 mb-3">
        ไม่ติ๊กเลย = สินค้าส่วนกลาง ทุกบริษัทเลือกใช้ได้ · ติ๊กบางบริษัท = เห็น/เลือกได้เฉพาะบริษัทที่ติ๊ก
        (มีผลเฉพาะการเลือกสินค้าในเอกสารใหม่ — เอกสารเดิมไม่ถูกกระทบ)
      </p>

      <div className="mb-3 text-xs">
        {checked.size === 0 ? (
          <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5">
            สินค้าส่วนกลาง — ทุกบริษัทใช้ได้
          </span>
        ) : (
          <span className="inline-block bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5">
            จำกัดเฉพาะ {checked.size} บริษัท
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1 mb-3">
        {customers.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-gray-50">
            <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4" />
            <span className="truncate">
              {c.companyName} <span className="text-gray-400">({c.code})</span>
            </span>
          </label>
        ))}
        {customers.length === 0 && <p className="text-xs text-gray-400">ยังไม่มีบริษัทลูกค้าในระบบ</p>}
      </div>

      {message && (
        <div
          role="status"
          className={`text-sm rounded px-3 py-2 border mb-3 ${
            message.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || isPending}
          className="text-sm bg-blue-600 text-white rounded px-4 py-1.5 disabled:opacity-40 hover:bg-blue-700"
        >
          {isPending ? "กำลังบันทึก..." : "บันทึกการกำหนดบริษัท"}
        </button>
        {dirty && !isPending && <span className="text-xs text-amber-600">● มีการแก้ไขที่ยังไม่ได้บันทึก</span>}
      </div>
    </div>
  );
}
