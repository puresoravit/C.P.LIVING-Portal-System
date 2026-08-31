"use client";

import { useRouter } from "next/navigation";

// S4 UAT round 5 — Owner: ปุ่มย้อนกลับต้องกลับไป "หน้าที่กดมาจริง" ไม่ใช่ route ตายตัว
// (เดิม hardcode href ทำให้กดกลับแล้วเด้งไปหน้ารายการทั้งที่มาจากหน้าอื่น) — ใช้
// router.back() เมื่อมีประวัติใน tab นี้จริง, fallback ไป href ที่ให้มาเมื่อเปิดหน้าตรงๆ
// (เช่น เปิดลิงก์ในแท็บใหม่ history.length <= 1)
export function BackLink({ fallbackHref, label = "← ย้อนกลับ", className }: { fallbackHref: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <a
      href={fallbackHref}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className={className ?? "text-sm text-blue-600 hover:underline"}
    >
      {label}
    </a>
  );
}
