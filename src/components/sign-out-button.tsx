"use client";

import { signOut } from "next-auth/react";

// Owner UAT — Billing UI Visual Polish: `icon` เป็น Optional ล้วนๆ (Additive) — ไม่ส่งมา
// = พฤติกรรม/หน้าตาเดิมทุกประการ (ปุ่มอื่นที่ใช้ Component นี้อยู่แล้วไม่กระทบเลย)
export function SignOutButton({
  className = "w-full text-sm text-gray-600 hover:text-red-600 px-3 py-2 text-left",
  label = "ออกจากระบบ",
  icon,
}: {
  className?: string;
  label?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button onClick={() => signOut({ callbackUrl: "/login" })} className={className}>
      {icon}
      {label}
    </button>
  );
}
