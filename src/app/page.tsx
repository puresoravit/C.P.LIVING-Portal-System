import { redirect } from "next/navigation";

// R6 Phase F (Follow-up) — Root ของเว็บ = ทางเข้า Application Portal เสมอ ตาม Flow ที่
// Owner กำหนด ("เข้าเว็บ → Splash → Login → Portal → เลือก App"):
// - ยังไม่ Login → Middleware เด้งไป /login ก่อนถึงหน้านี้อยู่แล้ว (Splash → Login)
// - Login แล้ว → มาถึงหน้านี้ → ส่งต่อไป /portal ทันที
// หน้า Billing Dashboard เดิมที่เคยอยู่ที่ "/" ย้ายไปอยู่ที่ /dashboard (ในกลุ่มแอพ
// Billing ตามปกติ) — ผลพลอยได้: ทุก redirect("/") เดิมที่ใช้เด้งคนไม่มีสิทธิ์ จะพามา
// จบที่ Portal อย่างปลอดภัยแทนที่จะเข้า Dashboard ตรงๆ
export default function RootPage() {
  redirect("/portal");
}
