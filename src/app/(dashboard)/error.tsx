"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/log-client-error";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logClientError(error.message, error.digest).catch(() => {
      // ถ้าบันทึก log ไม่สำเร็จ ก็ยังต้องให้ผู้ใช้เห็นหน้า error ปกติต่อไป
    });
  }, [error]);

  return (
    <div className="max-w-md mx-auto mt-20 text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <h1 className="text-lg font-semibold mb-2">เกิดข้อผิดพลาดบางอย่าง</h1>
      <p className="text-sm text-gray-500 mb-4">
        ระบบบันทึกปัญหานี้ไว้แล้ว หากเกิดขึ้นซ้ำๆ กรุณาแจ้งผู้ดูแลระบบ
      </p>
      <div className="flex gap-2 justify-center">
        <button onClick={() => reset()} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
          ลองใหม่อีกครั้ง
        </button>
        <a href="/" className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2">
          กลับหน้าแรก
        </a>
      </div>
    </div>
  );
}
