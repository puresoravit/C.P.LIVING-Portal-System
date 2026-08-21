import type { ZodError } from "zod";

// Phase R2 — แปลง ZodError → Record<field, message> เพื่อผูก Error กับ Field เฉพาะ
// เจาะจง (ตาม Shared Field Error Pattern) เอาแค่ error แรกต่อ field (พอสำหรับ UX
// Highlight ทีละจุด ไม่ต้องแสดงหลาย error ซ้อนกันในช่องเดียว)
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) out[key] = issue.message;
  }
  return out;
}
