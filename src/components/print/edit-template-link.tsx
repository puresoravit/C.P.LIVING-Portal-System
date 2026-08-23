"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DocumentTypeKey } from "@/lib/print-template-settings";

// R6 Phase E.3 Follow-up — Owner รายงานว่ากดลิงก์แก้ไขจากหน้าพิมพ์แล้ว "กลับ Back มา
// หน้าเอกสารเดิมไม่ได้" — แนบ Path ปัจจุบันไปกับลิงก์เป็น Query "back" ให้หน้า Designer
// แสดงปุ่ม "กลับไปหน้าเอกสาร" ที่เด้งกลับมาหน้าพิมพ์เดิมได้ตรงๆ เสมอ (Deterministic —
// ไม่พึ่ง Browser History ซึ่งผู้ใช้ทั่วไปคาดเดายาก) — ต้องเป็น Client Component เพราะ
// PrintPage เป็น Server Component ที่ไม่รู้ URL ของตัวเอง (usePathname รู้)
export function EditTemplateLink({ docType }: { docType: DocumentTypeKey }) {
  const pathname = usePathname();
  return (
    <Link
      href={`/settings/print-template?back=${encodeURIComponent(pathname)}#${docType}`}
      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
    >
      แก้ไขรูปแบบเอกสาร / Edit Template
    </Link>
  );
}
