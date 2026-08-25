"use client";

import { useEffect, useState } from "react";
import {
  PRINT_PROFILES,
  DEFAULT_PRINT_PROFILE,
  printPageStyleFor,
  PRINT_PROFILE_STORAGE_KEY as STORAGE_KEY,
  PRINT_PROFILE_CHANGE_EVENT,
  type PrintProfileKey,
} from "@/lib/print-settings";

// ข้อ 8 (Print Profile): ให้เลือกขนาดกระดาษก่อน print ได้ จำค่าไว้ด้วย localStorage
// ไม่บันทึกลง Database ตามที่อนุมัติ — ทำงานเป็น client component เพราะ @page CSS
// ต้องถูกฉีดเข้า <style id="print-page-style"> ที่ server render ไว้เป็นค่า default
// (DEFAULT_PRINT_PROFILE) อยู่แล้ว องค์ประกอบนี้แค่ override ทับตอน mount/เปลี่ยนค่า
export function PrintProfileSelector() {
  const [profile, setProfile] = useState<PrintProfileKey>(DEFAULT_PRINT_PROFILE);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as PrintProfileKey | null;
    if (saved && PRINT_PROFILES[saved]) setProfile(saved);
  }, []);

  useEffect(() => {
    const styleEl = document.getElementById("print-page-style") as HTMLStyleElement | null;
    if (styleEl) styleEl.textContent = `@media print { ${printPageStyleFor(profile)} }`;

    // Smoke Test R6 (2026-08-25) — ทดสอบจริงทั้ง 4 ชุด (Chrome/Safari × A4/9×11): Chrome
    // ตรงเป๊ะทั้งคู่ แต่ Safari "เกย" เป็นหน้า 2 เสมอทั้งคู่ โดยปริมาณเกยแปรตาม
    // contentHeightMm ตรงๆ → พื้นที่พิมพ์ใช้ได้จริงของ Safari เล็กกว่าที่ Browser รายงาน
    // ~15-20mm (Safari ไม่รองรับ @page size + คิด Margin/Scale ของตัวเอง เอกสารอ้างอิง
    // ไม่ตรงกับพฤติกรรมจริง) — หักเผื่อเฉพาะ Safari 22mm: เอกสารสั้นลงเล็กน้อย (ช่องว่าง
    // ท้ายกระดาษเพิ่ม ~2cm) แลกกับหน้าเดียวเสมอ — Chrome (รวมงานพิมพ์ EPSON 9×11 จริง
    // ที่ใช้ Chrome) ไม่โดนหักอะไรเลย Layout ที่ทดสอบผ่านแล้วคงเดิมทุกมิลลิเมตร
    const isSafari =
      /safari/i.test(navigator.userAgent) && !/chrome|chromium|crios|edg|android/i.test(navigator.userAgent);
    const SAFARI_TRIM_MM = 22;

    const p = PRINT_PROFILES[profile];
    document.documentElement.style.setProperty(
      "--print-content-height",
      `${p.contentHeightMm - (isSafari ? SAFARI_TRIM_MM : 0)}mm`
    );
  }, [profile]);

  function handleChange(next: PrintProfileKey) {
    setProfile(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    // R6 Phase D — แจ้ง PrintButton (Sibling Component คนละต้นไม้) ว่า Profile
    // เปลี่ยนแล้ว เพื่อเปิด/ปิดปุ่ม "มาร์คว่าพิมพ์แล้ว" ให้ตรงกับที่เลือกอยู่จริงทันที
    window.dispatchEvent(new CustomEvent(PRINT_PROFILE_CHANGE_EVENT, { detail: next }));
  }

  return (
    <div className="print:hidden flex items-center gap-2 text-sm">
      <label className="text-gray-600 whitespace-nowrap" htmlFor="print-profile-select">
        ขนาดกระดาษ:
      </label>
      <select
        id="print-profile-select"
        value={profile}
        onChange={(e) => handleChange(e.target.value as PrintProfileKey)}
        className="border rounded px-2 py-1 text-sm"
      >
        {Object.entries(PRINT_PROFILES).map(([key, p]) => (
          <option key={key} value={key}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
