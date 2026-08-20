import fs from "fs";
import path from "path";

// ==========================================================================
// LOGGER (ข้อ 67)
// ต้อง Redact field อ่อนไหวเสมอ: password, passwordHash, token, secret
//
// สอง channel แยกกัน โดยตั้งใจให้ไม่พึ่งกัน:
// 1. console.error (stdout/stderr) — channel หลักที่รับประกันว่าใช้ได้เสมอ
//    ไม่ว่า deploy ที่ไหน (PaaS ทุกเจ้า capture stdout/stderr ให้อัตโนมัติ
//    อยู่แล้วโดยไม่ต้องผูกกับ vendor ไหนเป็นพิเศษ) — พิมพ์ entry เต็ม
//    (JSON บรรทัดเดียว ผ่าน redact() แล้ว) ไม่ใช่แค่ message สั้นๆ เพื่อให้
//    ดู stack/extra ย้อนหลังได้จาก log viewer ของ hosting platform เองได้
//    แม้ไฟล์ในข้อ 2 จะหายไปก็ตาม
// 2. ไฟล์ logs/app.log — เขียนเพิ่มเพื่อให้หน้า "System Logs" ในแอปอ่านย้อน
//    หลังได้สะดวก เป็น best-effort เสริมเท่านั้น ใช้งานได้เต็มที่บน
//    deployment แบบ single-PC (local disk persist จริง) แต่บน cloud
//    platform ที่ local disk เป็น ephemeral (หายเมื่อ restart/redeploy)
//    ไฟล์นี้ไม่รับประกันว่าจะอยู่ครบ — ให้พึ่ง log viewer ของ hosting
//    platform (จาก channel 1) เป็นแหล่งอ้างอิงหลักแทนในกรณีนั้น
// ==========================================================================

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");
const SENSITIVE_KEYS = ["password", "passwordHash", "token", "secret", "nextauth_secret"];

function redact(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      result[key] = redact(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function logError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const entry = {
    level: "ERROR",
    timestamp: new Date().toISOString(),
    context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    extra: extra ? redact(extra) : undefined,
  };

  // Channel 1: console (stdout/stderr) — พิมพ์ entry เต็ม ไม่ใช่แค่ message
  // เพราะนี่คือช่องทางเดียวที่รับประกันว่า capture ได้เสมอไม่ว่าจะ deploy
  // ที่ไหน (ต่างจากไฟล์ด้านล่างที่อาจหายบน ephemeral disk)
  console.error(JSON.stringify(entry));

  // Channel 2: ไฟล์ logs/app.log — best-effort เสริม สำหรับหน้า System Logs
  // ในแอป ไม่ throw ต่อถ้าเขียนไม่ได้ (เช่น read-only filesystem บน
  // serverless/ephemeral container) เพราะ channel 1 ทำงานไปแล้วเสมอ
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {
    // เขียนไฟล์ไม่ได้ก็ไม่เป็นไร — console.error ข้างบนบันทึกไปแล้ว
  }
}

/**
 * อ่าน log ล่าสุด N บรรทัด สำหรับหน้า System Logs — อ่านจากไฟล์ (channel 2)
 * เท่านั้น ถ้า deploy บน cloud ที่ local disk เป็น ephemeral รายการที่เห็น
 * ในหน้านี้อาจไม่ครบ (คืน [] เฉยๆ ถ้าไฟล์ไม่มี ไม่ throw) ให้ดู log
 * เต็มจาก log viewer ของ hosting platform แทนในกรณีนั้น
 */
export function readRecentLogs(limit = 200): Array<Record<string, unknown>> {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { level: "UNKNOWN", message: line };
        }
      });
  } catch {
    return [];
  }
}
