import { NextRequest, NextResponse } from "next/server";
import { createBackup } from "@/lib/backup";
import { logError } from "@/lib/logger";

// ข้อ 49: Automatic Backup — ตั้ง Windows Task Scheduler หรือ cron ให้เรียก
// endpoint นี้ทุกวัน (ดูวิธีตั้งค่าใน README) ป้องกันด้วย secret token
// เพื่อไม่ให้ใครก็ได้สั่ง backup ผ่านอินเทอร์เน็ต
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
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
