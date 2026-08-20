import { NextRequest, NextResponse } from "next/server";
import { createBackup } from "@/lib/backup";
import { logError } from "@/lib/logger";

// ข้อ 49: Automatic Backup — ตั้ง Windows Task Scheduler หรือ cron ให้เรียก
// endpoint นี้ทุกวัน (ดูวิธีตั้งค่าใน README) ป้องกันด้วย secret token ผ่าน
// Authorization header (ไม่ใช่ query string — กัน secret รั่วผ่าน server
// access log / browser history / referrer เวลาเปิดใช้งานผ่าน internet จริง)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!process.env.BACKUP_SECRET || secret !== process.env.BACKUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await createBackup();
    return NextResponse.json({ ok: true, filename: result.filename });
  } catch (err) {
    logError("auto-backup", err);
    return NextResponse.json({ ok: false, error: "Backup failed" }, { status: 500 });
  }
}
