import fs from "fs";
import path from "path";

// ==========================================================================
// LOGGER (ข้อ 67) — เขียน Application Log ลงไฟล์ในเครื่อง (เหมาะกับ
// Single-PC Deployment ตามสถาปัตยกรรมที่ตัดสินใจไว้)
// ต้อง Redact field อ่อนไหวเสมอ: password, passwordHash, token, secret
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

  // เขียนขึ้น console เสมอ (เห็นได้ตอน dev / ดูผ่าน process manager ตอน production)
  console.error(`[${entry.timestamp}] [${context}]`, entry.message);

  // เขียนลงไฟล์ด้วย เพื่อดูย้อนหลังได้ผ่านหน้า System Logs
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {
    // ถ้าเขียนไฟล์ไม่ได้ (เช่น สิทธิ์ไฟล์) อย่างน้อย console.error ข้างบนยังทำงาน
  }
}

/** อ่าน log ล่าสุด N บรรทัด สำหรับหน้า System Logs */
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
