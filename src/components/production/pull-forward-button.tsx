"use client";

import { useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { pullForwardShipDate } from "@/app/production/orders/actions";

// CP7 round 2 (Owner UAT) — ทางลัด "ส่งวันนี้แทน" จากคิว แทน drag-and-drop ระหว่าง
// การ์ด (ซับซ้อนเกินความจำเป็นบนมือถือ — เป้าหมายเดียวกันคือถามยืนยันแล้วดึงวันที่มาวันนี้)
export function PullForwardButton({ customerPoId, version, dateLabel }: { customerPoId: string; version: number; dateLabel: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useToast();

  function handleConfirm() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("version", String(version));
        const result: ActionResult = await pullForwardShipDate(customerPoId, formData);
        if (!result.success) {
          showError(result.error);
          return;
        }
        setShowConfirm(false);
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        showError("บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowConfirm(true);
        }}
        className="text-xs text-gray-500 border border-gray-300 rounded-full px-2 py-0.5 hover:bg-gray-50 hover:text-gray-700"
      >
        ส่งวันนี้แทน
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowConfirm(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-base mb-2">ต้องการส่งออเดอร์นี้วันนี้แทนใช่ไหม?</h2>
            <p className="text-sm text-gray-500 mb-4">
              กำหนดส่งเดิม {dateLabel} จะถูกเปลี่ยนเป็นวันนี้ — ใช้เมื่อผลิตเสร็จเร็วกว่ากำหนดและอยากขึ้นของวันนี้เลย
              (บันทึกเป็นประวัติแก้ไขออเดอร์)
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowConfirm(false);
                }}
                disabled={isPending}
                className="text-sm border rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleConfirm();
                }}
                disabled={isPending}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2"
              >
                {isPending ? "กำลังบันทึก..." : "ยืนยัน ส่งวันนี้"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
