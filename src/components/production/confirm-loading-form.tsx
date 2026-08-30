"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import { confirmLoadingTrip, removeLoadingPhoto } from "@/app/production/loading/actions";

// CP2 — ฟอร์มยืนยันขึ้นของ: ยอดจริงต่อรายการ (prefill = แผน แก้ได้รวมถึง 0) + อัปโหลดรูป
// ต่อจุดส่ง (ผ่าน API route เพราะรูปมือถือใหญ่เกิน limit ของ server action) — server
// validate ซ้ำทุกอย่างตอน submit (ครบทุกรายการ/รูปครบทุกจุด/CAS)

export type ConfirmLoadingData = {
  tripId: string;
  tripNo: string;
  version: number;
  drops: {
    id: string;
    label: string;
    photoPaths: string[];
    lines: { id: string; label: string; size: string | null; qtyPlanned: number }[];
  }[];
};

export function ConfirmLoadingForm({ data }: { data: ConfirmLoadingData }) {
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.drops.flatMap((d) => d.lines.map((l) => [l.id, String(l.qtyPlanned)])))
  );
  const [uploadingDropId, setUploadingDropId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

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

  function handleRemovePhoto(dropId: string, path: string) {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("version", String(data.version));
        formData.set("path", path);
        const result = await removeLoadingPhoto(data.tripId, dropId, formData);
        if (!result.success) {
          showError(result.error);
          return;
        }
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("ลบรูปไม่สำเร็จ");
      }
    });
  }

  function handleConfirm() {
    const entries: { lineId: string; qtyLoaded: number }[] = [];
    for (const drop of data.drops) {
      for (const line of drop.lines) {
        const n = Number(qty[line.id]);
        if (!Number.isInteger(n) || n < 0) {
          showError(`กรุณากรอกจำนวนเต็ม 0 ขึ้นไปให้ครบทุกรายการ (ติดที่ "${line.label}")`);
          return;
        }
        entries.push({ lineId: line.id, qtyLoaded: n });
      }
    }
    const missingPhoto = data.drops.find((d) => d.lines.length > 0 && d.photoPaths.length === 0);
    if (missingPhoto) {
      showError(`จุดส่ง "${missingPhoto.label}" ยังไม่มีรูปใบขึ้นของ — แนบรูปก่อนยืนยัน`);
      return;
    }
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("version", String(data.version));
        formData.set("linesJson", JSON.stringify(entries));
        const result = await confirmLoadingTrip(data.tripId, formData);
        if (!result.success) {
          showError(result.error);
          return;
        }
        router.push(`/production/loading/${data.tripId}`);
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("ยืนยันไม่สำเร็จ — กรุณาลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ");
      }
    });
  }

  const totalPlanned = data.drops.reduce((s, d) => s + d.lines.reduce((x, l) => x + l.qtyPlanned, 0), 0);
  const totalLoaded = data.drops.reduce((s, d) => s + d.lines.reduce((x, l) => x + (Number(qty[l.id]) || 0), 0), 0);

  return (
    <div className="space-y-3">
      {data.drops.map((drop) => (
        <div key={drop.id} className="bg-white border rounded-lg p-3">
          <div className="text-sm font-medium mb-2">{drop.label}</div>

          {drop.lines.length === 0 ? (
            <p className="text-xs text-gray-400">จุดนี้ไม่มีรายการ — ไม่ต้องกรอก/แนบรูป</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {drop.lines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      {line.label}
                      {line.size && <span className="text-gray-500"> (ไซส์ {line.size})</span>}
                      <span className="text-xs text-gray-400 ml-1">แผน {line.qtyPlanned}</span>
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={qty[line.id] ?? ""}
                      onChange={(e) => setQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      className={`w-24 border rounded px-2 py-1.5 text-sm text-right shrink-0 ${Number(qty[line.id]) !== line.qtyPlanned ? "border-amber-400 bg-amber-50" : ""}`}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-3 border-t pt-2">
                <div className="text-xs font-medium text-gray-600 mb-1.5">
                  รูปใบขึ้นของที่ขีดนับแล้ว * ({drop.photoPaths.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {drop.photoPaths.map((p) => (
                    <span key={p} className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/production/loading-photos/${p}`} alt="รูปใบขึ้นของ" className="w-20 h-20 object-cover rounded border" />
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleRemovePhoto(drop.id, p)}
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
            </>
          )}
        </div>
      ))}

      <div className="bg-white border rounded-lg p-3 text-sm flex items-center justify-between">
        <span className="text-gray-600">รวมตามแผน {totalPlanned} ชิ้น</span>
        <span className="font-semibold">รวมขึ้นจริง {totalLoaded} ชิ้น</span>
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={handleConfirm}
        className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-3"
      >
        {isPending ? "กำลังบันทึก..." : "ยืนยันขึ้นของจริงตามยอดข้างบน"}
      </button>
      <p className="text-xs text-gray-400 text-center">ยืนยันแล้วแผนถูกล็อก — จำนวนที่ต่างจากแผนถูกไฮไลต์ให้ตรวจก่อนกด</p>
    </div>
  );
}
