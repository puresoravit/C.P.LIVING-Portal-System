"use server";

import { logError } from "@/lib/logger";

// Final Audit — Action นี้เรียกได้โดยไม่ต้อง Login (Error Boundary ต้องรายงานได้แม้
// Session หมดอายุ) จึงต้องจำกัดขนาด Input ฝั่ง Server เสมอ: ไม่งั้นใครก็ส่ง String
// ขนาดใหญ่มาถล่ม Log File ได้ (ค่าจริงจาก Error Boundary สั้นกว่านี้มาก — Truncate
// ไม่กระทบการใช้งานจริงใดๆ)
const MAX_MESSAGE_LEN = 2000;
const MAX_DIGEST_LEN = 128;

export async function logClientError(message: string, digest?: string) {
  const safeMessage = String(message).slice(0, MAX_MESSAGE_LEN);
  const safeDigest = digest === undefined ? undefined : String(digest).slice(0, MAX_DIGEST_LEN);
  logError("client-error-boundary", new Error(safeMessage), { digest: safeDigest });
}
