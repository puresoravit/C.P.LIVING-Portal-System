"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PRINT_PROFILE,
  PRINT_PROFILE_STORAGE_KEY,
  PRINT_PROFILE_CHANGE_EVENT,
  type PrintProfileKey,
} from "@/lib/print-settings";

// R6 Phase D — Sales SOT: "มาร์คว่าพิมพ์แล้ว" ต้องแปลว่ายืนยันพิมพ์กระดาษต่อเนื่อง 9×11
// จริงเท่านั้น (A4 = ตรวจเอกสาร/ทดลองพิมพ์ ห้ามนับ) — อ่าน Print Profile ปัจจุบันจาก
// localStorage (Sync กับ PrintProfileSelector ผ่าน Custom Event เพราะเป็นคนละ Component
// Tree กัน ไม่มี Parent ร่วมที่เป็น Client ให้ Lift State ได้ตรงๆ) ปุ่มจะกดได้เฉพาะตอน
// เลือก 9×11 อยู่ และเอกสารยังไม่เคยถูกมาร์คว่าพิมพ์แล้ว — ถ้ามาร์คแล้วโชว์วันที่แทนปุ่ม
// กัน Reprint สั่งเขียนทับ printedAt เดิม (Server ก็เช็ค status ซ้ำอีกชั้นอยู่ดี)
export function PrintButton({
  markPrintedAction,
  isPrinted,
  printedAtLabel,
  backHref,
}: {
  markPrintedAction?: (formData: FormData) => void;
  /** true = เอกสารนี้ผ่าน PRINTED Checkpoint แล้ว (โชว์วันที่แทนปุ่ม) */
  isPrinted?: boolean;
  printedAtLabel?: string;
  // Owner UAT (2026-08-23) — เดิมปุ่ม "← กลับ" ใช้ history.back() ซึ่งพากลับไป "หน้าที่มา
  // ล่าสุด" — ถ้าเพิ่งกลับมาจากหน้าแก้ไขฟอร์ม (Document Designer) จะวนกลับไปหน้าแก้ไขฟอร์ม
  // อีกรอบแทนที่จะกลับหน้าเอกสาร — แก้เป็นลิงก์ตรงไปหน้า Detail ของเอกสาร (หน้าคีย์สินค้า)
  // เสมอเมื่อหน้า Print ระบุมา — ไม่ระบุ = Fallback history.back() เดิม (กันหน้าเก่าพัง)
  backHref?: string;
}) {
  const [profile, setProfile] = useState<PrintProfileKey>(DEFAULT_PRINT_PROFILE);

  useEffect(() => {
    const saved = window.localStorage.getItem(PRINT_PROFILE_STORAGE_KEY) as PrintProfileKey | null;
    if (saved) setProfile(saved);
    function handleChange(e: Event) {
      setProfile((e as CustomEvent<PrintProfileKey>).detail);
    }
    window.addEventListener(PRINT_PROFILE_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(PRINT_PROFILE_CHANGE_EVENT, handleChange);
  }, []);

  return (
    // Owner UAT (2026-08-23) — พื้นที่ Toolbar แคบ (Sidebar กินความกว้าง) เคยทำให้ข้อความใน
    // ปุ่ม/ป้ายถูกบีบตัดขึ้นบรรทัดใหม่จนเป็นแนวตั้งอ่านยาก — ใส่ whitespace-nowrap ทุกชิ้น
    // (ข้อความชิ้นหนึ่งอยู่บรรทัดเดียวเสมอ) + flex-wrap ที่ Container (พื้นที่ไม่พอให้ตัดขึ้น
    // แถวใหม่ "ทั้งชิ้น" แทนการบีบตัวอักษร)
    <div className="print:hidden flex flex-wrap items-center gap-2 mb-4 sticky top-0 bg-gray-50 py-2 z-10">
      <button
        onClick={() => window.print()}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2 whitespace-nowrap"
      >
        พิมพ์ / บันทึกเป็น PDF
      </button>

      {markPrintedAction && isPrinted && (
        <span className="text-sm text-green-700 border border-green-200 bg-green-50 rounded px-3 py-2 whitespace-nowrap">
          ✓ พิมพ์แล้ว{printedAtLabel ? ` เมื่อ ${printedAtLabel}` : ""}
        </span>
      )}

      {markPrintedAction && !isPrinted && profile === "continuous" && (
        <form action={markPrintedAction}>
          <input type="hidden" name="printProfile" value={profile} />
          <button className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap">
            มาร์คว่าพิมพ์แล้ว (9×11)
          </button>
        </form>
      )}

      {markPrintedAction && !isPrinted && profile !== "continuous" && (
        <span className="text-xs text-amber-700 border border-amber-200 bg-amber-50 rounded px-3 py-2 whitespace-nowrap">
          เปลี่ยนเป็น &quot;กระดาษต่อเนื่อง 9×11&quot; ก่อน จึงจะมาร์คว่าพิมพ์แล้วได้
        </span>
      )}

      {backHref ? (
        <a href={backHref} className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap">
          ← กลับ
        </a>
      ) : (
        <button
          onClick={() => window.history.back()}
          className="text-sm text-gray-600 hover:text-gray-900 border rounded px-4 py-2 whitespace-nowrap"
        >
          ← กลับ
        </button>
      )}
    </div>
  );
}
