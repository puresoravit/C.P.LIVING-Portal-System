"use client";

import { useEffect, useState } from "react";
import { PRINT_PROFILES, DEFAULT_PRINT_PROFILE, printPageStyleFor, type PrintProfileKey } from "@/lib/print-settings";

const STORAGE_KEY = "billSystemPrintProfile";

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

    const p = PRINT_PROFILES[profile];
    document.documentElement.style.setProperty("--print-content-height", `${p.contentHeightMm}mm`);
  }, [profile]);

  function handleChange(next: PrintProfileKey) {
    setProfile(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <div className="print:hidden flex items-center gap-2 text-sm">
      <label className="text-gray-600" htmlFor="print-profile-select">
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
