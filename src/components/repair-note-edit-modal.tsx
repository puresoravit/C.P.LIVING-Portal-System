"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// ==========================================================================
// Owner (2026-09-02) — แก้ไขรายการของใบส่งคืนสินค้าฝากซ่อมที่ยืนยันแล้ว (เดิมไม่มี Function
// แก้ไขเลย): เคสหลักคือลืมใส่ "หมายเหตุต่อรายการ" (เช่นอ้างอิงเลข INV) ตอนคีย์ครั้งแรก —
// แก้ได้ทุกช่องของรายการ (รายการ/ขนาด/จำนวน/หน่วย/หมายเหตุ) + เพิ่ม/ลบแถว — เอกสารนี้
// ไม่มีเงิน/ไม่มี Downstream Document การแทนที่รายการทั้งชุดจึงปลอดภัย (ดูคำอธิบายที่
// updateRepairReturnNoteItems ใน repair-notes/actions.ts — เก็บชุดเดิมลง AuditLog เสมอ)
// ==========================================================================

type EditItem = { key: string; description: string; size: string; quantity: number; unit: string; note: string };

export function RepairNoteEditModal({
  action,
  initialItems,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  initialItems: EditItem[];
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<EditItem[]>(initialItems);
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();

  function patch(key: string, field: keyof EditItem, value: string | number) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  }
  function remove(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }
  function add() {
    setItems((prev) => [
      ...prev,
      { key: `new-${Date.now()}`, description: "", size: "", quantity: 1, unit: "หลัง", note: "" },
    ]);
  }

  const invalid = items.length === 0 || items.some((it) => !it.description.trim() || !(it.quantity > 0) || !it.unit.trim());

  function submit() {
    const formData = new FormData();
    formData.set(
      "itemsJson",
      JSON.stringify(
        items.map((it) => ({
          description: it.description.trim(),
          size: it.size.trim() || undefined,
          quantity: it.quantity,
          unit: it.unit.trim(),
          note: it.note.trim() || undefined,
        }))
      )
    );
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        showSuccess("บันทึกการแก้ไขสำเร็จ");
        setOpen(false);
      } else {
        showError(result.error ?? "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setItems(initialItems);
          setOpen(true);
        }}
        className="text-sm text-gray-600 hover:text-blue-600 border rounded px-4 py-2"
      >
        แก้ไขรายการ
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-sm">แก้ไขรายการสินค้าส่งคืน</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="text-gray-600 text-left">
                  <tr>
                    <th className="py-1 pr-2 font-medium">รายการ</th>
                    <th className="py-1 pr-2 font-medium w-24">ขนาด</th>
                    <th className="py-1 pr-2 font-medium w-16">จำนวน</th>
                    <th className="py-1 pr-2 font-medium w-20">หน่วย</th>
                    <th className="py-1 pr-2 font-medium">หมายเหตุ (เช่น อ้างอิง INV)</th>
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.key} className="border-t">
                      <td className="py-1.5 pr-2">
                        <input
                          value={it.description}
                          onChange={(e) => patch(it.key, "description", e.target.value)}
                          className={`w-full border rounded px-2 py-1 ${!it.description.trim() ? "border-red-400" : ""}`}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={it.size} onChange={(e) => patch(it.key, "size", e.target.value)} className="w-full border rounded px-2 py-1" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => patch(it.key, "quantity", Number(e.target.value))}
                          className={`w-full border rounded px-2 py-1 text-right ${!(it.quantity > 0) ? "border-red-400" : ""}`}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={it.unit} onChange={(e) => patch(it.key, "unit", e.target.value)} className="w-full border rounded px-2 py-1" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          value={it.note}
                          onChange={(e) => patch(it.key, "note", e.target.value)}
                          placeholder="เช่น อ้างอิง INV-B-202609-0003"
                          className="w-full border rounded px-2 py-1"
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <button type="button" onClick={() => remove(it.key)} className="text-xs text-gray-500 hover:text-red-600">
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={add} className="mt-2 text-sm text-blue-600 hover:underline">
                + เพิ่มรายการ
              </button>
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-600 border rounded px-4 py-2">
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={invalid || isPending}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2"
              >
                {isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
