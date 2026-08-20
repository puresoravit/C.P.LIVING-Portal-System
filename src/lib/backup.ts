import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);
const BACKUP_DIR = path.join(process.cwd(), "backups");

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Prisma's DATABASE_URL ใช้ query param บางตัว (เช่น `schema=`) ที่เป็นแค่
 * convention ของ Prisma เอง ไม่ใช่ query param มาตรฐานของ libpq — ส่งตรงๆ
 * เข้า pg_dump/pg_restore จะ error "invalid URI query parameter" ต้องตัดออก
 * ก่อนเสมอ (pg_dump ไม่ต้องรู้ schema อยู่แล้ว เพราะ dump ทั้ง database ให้)
 */
export function toPgToolsUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
}

export function backupDir(): string {
  ensureBackupDir();
  return BACKUP_DIR;
}

/**
 * สำรองฐานข้อมูลด้วย pg_dump (custom format -F c — pg_restore จัดการ
 * ลำดับ dependency ระหว่างตารางให้อัตโนมัติตอน restore)
 * ต้องมี pg_dump อยู่ใน PATH ของเครื่อง (มากับการติดตั้ง PostgreSQL อยู่แล้ว)
 */
export async function createBackup(): Promise<{ filename: string }> {
  ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.dump`;
  const filepath = path.join(BACKUP_DIR, filename);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("ไม่พบ DATABASE_URL ใน environment");

  await execFileAsync("pg_dump", [toPgToolsUrl(databaseUrl), "-F", "c", "-f", filepath]);
  return { filename };
}

export function listBackups(): { filename: string; sizeBytes: number; createdAt: Date }[] {
  ensureBackupDir();
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".dump"))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, sizeBytes: stat.size, createdAt: stat.mtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * กู้คืนฐานข้อมูลจากไฟล์ backup — ⚠️ Destructive: ลบข้อมูลปัจจุบันทั้งหมด
 * ก่อน restore ทับ (--clean --if-exists) ใช้ในกรณีฉุกเฉินเท่านั้น
 */
export async function restoreBackup(filepath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("ไม่พบ DATABASE_URL ใน environment");

  await execFileAsync("pg_restore", ["--clean", "--if-exists", "-d", toPgToolsUrl(databaseUrl), filepath]);
}
