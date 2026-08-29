"use client";

import { useRouter } from "next/navigation";

// Owner UAT (2026-08-28) — ลิงก์ "← กลับ..." เดิมทุกหน้าเป็น href คงที่ไปหน้ารายการเปล่าๆ
// เสมอ (เช่น /invoices ตรงๆ) ไม่สนว่าจริงๆ เปิดหน้านี้มาจากไหน (อาจมาจากหน้า Order,
// Dashboard, หน้ารายการที่กรอง/ค้นหาไว้อยู่ ฯลฯ) — Owner ระบุชัดว่ากด "กลับ" แล้วต้องกลับไป
// หน้าก่อนหน้าที่กดมาจริงๆ ไม่ใช่เด้งไปหน้าคงที่เดิมทุกครั้ง — component นี้ใช้
// router.back() (History API จริง) เป็นพฤติกรรมหลัก, href ที่รับมายังคงเป็น Fallback ปลอดภัย
// สำหรับกรณีไม่มีประวัติให้ย้อนจริง (เปิดแท็บใหม่/เปิดจาก Bookmark ตรงๆ) — เช็ค 2 อย่างประกอบ
// กัน: history.length > 1 (มีแถวใน Session History) และ document.referrer ไม่ว่าง (แปลว่า
// มาจากการคลิกลิงก์ในหน้าเดิมจริง ไม่ใช่พิมพ์ URL เอง/เปิดแท็บใหม่ — history.length เพี้ยน
// เป็น false positive ได้ในบางกรณี เช่นบางเบราว์เซอร์/เครื่องมือสร้างแท็บว่างแทรกมาก่อน)
// **ไม่ใช้กับปุ่ม "← กลับ" ของหน้าพิมพ์เอกสาร** (print-button.tsx) ซึ่งจงใจใช้ backHref ที่
// ระบุปลายทางแน่นอนแทน History เพราะ Print Queue มีเหตุผลเฉพาะที่ต้องรู้ปลายทางล่วงหน้า
// (ดู Comment ในไฟล์นั้น) — เป็นคนละ Pattern กันโดยเจตนา
export function BackLink({
  href,
  children,
  className = "text-sm text-blue-600 hover:underline",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (typeof window !== "undefined" && window.history.length > 1 && document.referrer !== "") {
          e.preventDefault();
          router.back();
        }
      }}
    >
      {children}
    </a>
  );
}
