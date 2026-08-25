"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// ==========================================================================
// Production Smoke Test (2026-08-25) — Owner: ระหว่างคีย์สินค้าในเอกสาร (Draft) ถ้าแวะไป
// หน้าอื่น (แก้ข้อมูลสินค้า/ลูกค้า) แล้วกดเมนู "สร้างเอกสาร" กลับมา ต้องกลับเข้าหน้าคีย์
// สินค้าใบเดิม ไม่ใช่เริ่มเลือกลูกค้าใหม่ตั้งแต่ต้น
//
// กลไก: เอกสาร Order/Quotation เป็น Draft ใน DB อยู่แล้ว (ข้อมูลไม่เคยหาย) — ที่ขาดคือ
// เส้นทางนำกลับ จึงใช้ sessionStorage (per-tab, หายเองเมื่อปิดแท็บ — ไม่ข้ามผู้ใช้/เครื่อง)
// จำ URL หน้าคีย์สินค้าของ Draft ล่าสุดต่อประเภทเอกสาร:
//   - RememberDraft: วางในหน้า [id] — บันทึก URL เมื่อสถานะเป็น DRAFT / ลบทิ้งเมื่อสถานะ
//     เปลี่ยน (Confirm/Cancel แล้วไม่ต้องเด้งกลับอีก)
//   - DraftRedirect: วางในหน้า /new — ถ้ามี Draft ค้างของประเภทนั้น → redirect กลับพร้อม
//     ?resumed=1 (หน้า [id] ใช้โชว์แถบแจ้ง + ลิงก์ "เริ่มเอกสารใหม่")
//   - ทางออกเมื่อตั้งใจสร้างใบใหม่จริง: เข้า /new?fresh=1 (ลิงก์บนแถบแจ้ง) จะล้างค่าและ
//     ไม่เด้งกลับ
// ==========================================================================

const keyFor = (docKey: string) => `cp-draft-return:${docKey}`;

export function RememberDraft({ docKey, active, url }: { docKey: string; active: boolean; url: string }) {
  useEffect(() => {
    try {
      if (active) sessionStorage.setItem(keyFor(docKey), url);
      else if (sessionStorage.getItem(keyFor(docKey)) === url) sessionStorage.removeItem(keyFor(docKey));
    } catch {
      // sessionStorage ใช้ไม่ได้ (เช่น Private Mode บางเบราว์เซอร์) — ข้าม Feature นี้เฉยๆ
    }
  }, [docKey, active, url]);
  return null;
}

export function DraftRedirect({ docKey }: { docKey: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    try {
      const key = keyFor(docKey);
      if (searchParams.get("fresh")) {
        sessionStorage.removeItem(key);
        return;
      }
      const url = sessionStorage.getItem(key);
      if (url) router.replace(`${url}${url.includes("?") ? "&" : "?"}resumed=1`);
    } catch {
      // เหมือน RememberDraft — ไม่มี sessionStorage ก็แค่ไม่เด้งกลับ พฤติกรรมเดิมทุกอย่าง
    }
  }, [docKey, router, searchParams]);
  return null;
}
