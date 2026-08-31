"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import { cutOutstanding } from "@/app/production/outstanding/actions";

// CP4 — ปุ่มตัดยอดค้าง (แอดมินเท่านั้น — server enforce ผ่าน can() ซ้ำเสมอ): ตัดบางส่วนหรือ
// ทั้งหมดที่เหลือได้ บังคับเหตุผล — ห้ามเกินยอดเหลือ (server เช็คซ้ำใน Serializable tx)
export function CutOutstandingButton({ outstandingId, remaining, productLabel }: { outstandingId: string; remaining: number; productLabel: string }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(String(remaining));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

  function handleConfirm() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0 || n > remaining) {
      setErr(`จำนวนต้องเป็น 1 ถึง ${remaining}`);
      return;
    }
    if (!reason.trim()) {
      setErr("กรุณากรอกเหตุผลที่ตัดยอด");
      return;
    }
    setErr("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("qty", String(n));
        formData.set("reason", reason.trim());
        const result = await cutOutstanding(outstandingId, formData);
        if (!result.success) {
          showError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("ตัดยอดไม่สำเร็จ — กรุณาลองอีกครั้ง");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setQty(String(remaining));
          setReason("");
          setErr("");
        }}
        className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 font-medium"
      >
        ตัดยอดค้าง (ผู้ดูแลระบบ)
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h2 className="font-semibold text-base mb-1">ตัดยอดค้าง</h2>
            <p className="text-sm text-gray-500 mb-3">
              {productLabel} — เหลือค้าง {remaining} ชิ้น · ตัดบางส่วนหรือทั้งหมดได้ การตัดถอนกลับไม่ได้และมีบันทึกถาวร
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">จำนวนที่จะตัด *</label>
            <input
              type="number"
              min="1"
              max={remaining}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mb-2"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">เหตุผล *</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ลูกค้ายกเลิกส่วนที่เหลือ, ลดยอดออเดอร์"
              className="w-full border rounded px-3 py-2 text-sm mb-1"
              autoFocus
            />
            {err && <p className="text-xs text-red-600 mb-1">{err}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setOpen(false)} disabled={isPending} className="text-sm border rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50">
                ไม่ตัด
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2"
              >
                {isPending ? "กำลังบันทึก..." : "ยืนยันตัดยอด"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
