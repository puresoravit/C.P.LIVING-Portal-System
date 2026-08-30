"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// P2 CP1 — ฟอร์มหัวเที่ยวรถ ใช้ทั้งหน้าสร้าง (redirect ฝั่ง server) และแก้ไขบนหน้า detail
// (refresh) — mobile-first ช่องใหญ่ พิมพ์น้อย
export function LoadingTripHeaderForm({
  action,
  initial,
  version,
  submitLabel,
  onDone,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  initial: { tripDate: string; vehicleNote: string; note: string };
  /** ให้มา = โหมดแก้ไข (ส่ง version ไปกับ CAS) */
  version?: number;
  submitLabel: string;
  onDone?: () => void;
}) {
  const [tripDate, setTripDate] = useState(initial.tripDate);
  const [vehicleNote, setVehicleNote] = useState(initial.vehicleNote);
  const [note, setNote] = useState(initial.note);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("tripDate", tripDate);
        formData.set("vehicleNote", vehicleNote);
        formData.set("note", note);
        if (version != null) formData.set("version", String(version));
        const result = await action(formData);
        if (result && !result.success) {
          showError(result.error);
          return;
        }
        router.refresh();
        onDone?.();
      } catch (error) {
        unstable_rethrow(error);
        showError("บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ออกรถ *</label>
        <input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" required />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">รถ / ทะเบียน / คนขับ</label>
        <input value={vehicleNote} onChange={(e) => setVehicleNote(e.target.value)} placeholder="เช่น 6 ล้อ 71-2345 พี่หนุ่ม" className="w-full border rounded px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
      </div>
      <button type="submit" disabled={isPending} className="w-full bg-cp-navy hover:bg-cp-navy-light disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2.5">
        {isPending ? "กำลังบันทึก..." : submitLabel}
      </button>
    </form>
  );
}
