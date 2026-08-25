"use client";

// Production Smoke Test (2026-08-25) — Owner ติ๊ก "ใช้ส่วนลด" แล้วคาดว่ามีผลทันที แต่ของเดิม
// ต้องกดปุ่ม "บันทึกการตั้งค่า" ซ้ำอีกที (ติ๊กเฉยๆ ไม่ถูกเซฟ → ส่วนลดไม่คำนวณ ทั้งที่ตั้ง % กลุ่ม
// ถูกต้องแล้ว) — Checkbox ตัวนี้ submit Form แม่ทันทีที่ติ๊ก/เอาออก (requestSubmit ยิง Server
// Action ของ ActionForm ปกติ ผ่าน validation/toast เดิมทุกอย่าง) ปุ่มบันทึกเดิมยังอยู่เป็น
// Fallback — ใช้แทน <input type="checkbox"> เดิมในฟอร์มตั้งค่าของหน้า Draft
export function AutoSubmitCheckbox({
  name,
  defaultChecked,
  id,
}: {
  name: string;
  defaultChecked?: boolean;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      name={name}
      defaultChecked={defaultChecked}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    />
  );
}
