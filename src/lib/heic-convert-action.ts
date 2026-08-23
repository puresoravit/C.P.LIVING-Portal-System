"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { convertHeicBufferToJpeg, looksLikeHeicBuffer } from "@/lib/server-image-convert";

// ==========================================================================
// Owner UAT — Image Upload Compatibility: HEIC/HEIF → JPEG แปลงฝั่ง Server เท่านั้น
// (ดู server-image-convert.ts สำหรับเหตุผลที่ไม่ทำฝั่ง Client — ต้องใช้ 'unsafe-eval'
// ซึ่งขัดนโยบายความปลอดภัยของระบบ) — จุดเข้าเดียวที่รับไฟล์ดิบจาก Client ได้ ต้อง Login
// เท่านั้น (กันเป็น Free Image-conversion Endpoint ให้ Anonymous เรียกได้) — ไม่เขียนอะไร
// ลง DB/Disk เลย รับ Byte เข้า คืน Byte ออกอย่างเดียว (Stateless) จึงไม่ต้องมี Permission
// ละเอียดกว่า "Login แล้ว" — Path ปลายทางจริง (Save Avatar/Logo) ยัง Re-validate/Authorize
// ของมันเองอีกชั้นเหมือนเดิมทุกประการ ไม่ได้พึ่ง Action นี้เป็นเกราะป้องกันสุดท้าย
// ==========================================================================

const MAX_HEIC_INPUT_BYTES = 25 * 1024 * 1024; // ภาพจากกล้องมือถือจริงไม่เกินนี้แน่นอน

export type ConvertHeicResult = { success: true; dataUri: string } | { success: false; error: string };

export async function convertHeicToJpeg(formData: FormData): Promise<ConvertHeicResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "UNAUTHORIZED" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "ไม่พบไฟล์" };
  if (file.size > MAX_HEIC_INPUT_BYTES) {
    return { success: false, error: `ไฟล์ต้นฉบับใหญ่เกินไป (ไม่เกิน ${MAX_HEIC_INPUT_BYTES / 1024 / 1024}MB)` };
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  // ตรวจ Magic Byte ซ้ำฝั่ง Server เสมอ — ไม่เชื่อว่า Client ส่งไฟล์ HEIC จริงตามที่อ้าง
  if (!looksLikeHeicBuffer(inputBuffer)) {
    return { success: false, error: "ไฟล์ที่ส่งมาไม่ใช่ HEIC/HEIF ที่ถูกต้อง" };
  }

  try {
    const jpegBuffer = await convertHeicBufferToJpeg(inputBuffer);
    return { success: true, dataUri: `data:image/jpeg;base64,${jpegBuffer.toString("base64")}` };
  } catch {
    return {
      success: false,
      error: "แปลงไฟล์ HEIC/HEIF เป็น JPEG ไม่สำเร็จ — ไฟล์อาจเสียหาย กรุณาลองไฟล์อื่นหรือถ่ายภาพใหม่",
    };
  }
}
