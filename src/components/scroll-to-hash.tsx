"use client";

import { useEffect } from "react";

// Phase C — Browser พยายาม Scroll ไปหา URL Fragment (#id) ตอน Navigate ครั้งแรกโดย
// อัตโนมัติอยู่แล้ว แต่ App ที่ Hydrate ฝั่ง Client มักพลาดจังหวะ (Element ยังไม่ Render
// ตอน Browser ลองครั้งแรก) — Component เล็กๆ นี้ลอง Scroll ซ้ำอีกครั้งหลัง Mount เสร็จ
// จริง ใช้ร่วมกันได้ทุกหน้าที่มี Anchor แบบนี้ ไม่ใช่ Business Logic ใดๆ
export function ScrollToHash() {
  useEffect(() => {
    if (!window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    el?.scrollIntoView({ block: "start" });
  }, []);
  return null;
}
