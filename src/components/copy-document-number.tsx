"use client";

import { useToast } from "@/components/toast/toast-provider";

// Phase R2.5 — ปุ่ม Copy เลขที่เอกสารเล็กๆ ข้างเลขที่เอกสาร (ไม่ใช่ปุ่มใหญ่/Link)
// Copy เฉพาะเลขที่เอกสาร (value) เท่านั้น ไม่รวม Label ใดๆ — เป็น <button type="button">
// จริง ไม่ใช่ <a href> ปลอม, ไม่ใช้ javascript: URL — เป็น Client Component เล็กแยก
// ต่างหาก (ไม่ดึง toThaiBahtText/Prisma runtime ใดๆ เข้ามาด้วย ตาม Bug ที่เคยเจอใน
// Doc-Center) เรียก e.stopPropagation()/preventDefault() เสมอ กันไม่ให้ Event ทะลุไป
// โดน <a> ที่อาจห่ออยู่รอบนอก (เลขที่เอกสารเป็น Link ไปหน้า Detail ในบางที่)
// print:hidden เสมอ — ไม่ติดไปในเอกสารที่พิมพ์ ตัวเลขที่เอกสารจริงยังพิมพ์ปกติ
export function CopyDocumentNumber({ value, className = "" }: { value: string; className?: string }) {
  const { showSuccess, showError } = useToast();

  async function handleCopy(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      showSuccess(`คัดลอก ${value} แล้ว`);
    } catch {
      showError("คัดลอกไม่สำเร็จ — เบราว์เซอร์นี้ไม่รองรับการคัดลอกอัตโนมัติ กรุณาคัดลอกด้วยตนเอง");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="คัดลอกเลขที่เอกสาร"
      aria-label="คัดลอกเลขที่เอกสาร"
      className={`print:hidden inline-flex items-center justify-center text-gray-400 hover:text-blue-600 align-middle ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
}
