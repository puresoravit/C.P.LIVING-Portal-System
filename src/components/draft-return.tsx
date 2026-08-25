"use client";

import { useEffect, useState } from "react";

// ==========================================================================
// Production Smoke Test (2026-08-25) — Owner: ระหว่างคีย์สินค้าในเอกสาร (Draft) ถ้าแวะไป
// หน้าอื่น (แก้ข้อมูลสินค้า/ลูกค้า) แล้วกดเมนู "สร้างเอกสาร" กลับมา ต้องกลับเข้าหน้าคีย์
// สินค้าใบเดิมได้ ไม่ใช่เริ่มเลือกลูกค้าใหม่ตั้งแต่ต้น
//
// R6 (Feedback รอบสอง): เวอร์ชันแรก Redirect อัตโนมัติ — Owner ตอบกลับว่า "ไม่ควรบังคับ"
// (บางจังหวะตั้งใจมาสร้างใบใหม่จริงๆ แล้วโดนเด้งกลับใบค้าง ให้ความรู้สึกถูกล็อก) — เปลี่ยน
// เป็นแถบเสนอทางเลือกแทน: เข้า /new แล้วมีใบค้างของประเภทนั้น → โชว์แถบ "มีใบที่คีย์ค้างอยู่
// [กลับไปทำต่อ]" ให้กดเอง หน้า /new ใช้งานปกติทุกอย่าง ไม่มีการเด้งอัตโนมัติอีก
//
// กลไก: เอกสาร Order/Quotation เป็น Draft ใน DB อยู่แล้ว (ข้อมูลไม่เคยหาย) — ที่ขาดคือ
// เส้นทางนำกลับ จึงใช้ sessionStorage (per-tab, หายเองเมื่อปิดแท็บ — ไม่ข้ามผู้ใช้/เครื่อง)
// จำ URL หน้าคีย์สินค้าของ Draft ล่าสุดต่อประเภทเอกสาร:
//   - RememberDraft: วางในหน้า [id] — บันทึก URL เมื่อสถานะเป็น DRAFT / ลบทิ้งเมื่อสถานะ
//     เปลี่ยน (Confirm/Cancel แล้วไม่ต้องเสนออีก)
//   - DraftResumeBanner: วางในหน้า /new — โชว์แถบลิงก์กลับใบค้าง (ถ้ามี)
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

export function DraftResumeBanner({ docKey, label }: { docKey: string; label: string }) {
  const [draftUrl, setDraftUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDraftUrl(sessionStorage.getItem(keyFor(docKey)));
    } catch {
      // ไม่มี sessionStorage → ไม่โชว์แถบ พฤติกรรมเดิมทุกอย่าง
    }
  }, [docKey]);

  if (!draftUrl) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <span>มี{label}ที่คีย์ค้างอยู่</span>
      <a href={draftUrl} className="font-medium text-blue-700 hover:underline">
        กลับไปทำต่อ →
      </a>
      <span className="text-xs text-amber-700/70">หรือสร้างใบใหม่ด้านล่างได้ตามปกติ</span>
    </div>
  );
}
