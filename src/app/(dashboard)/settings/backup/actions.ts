"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { createBackup, restoreBackup, backupDir } from "@/lib/backup";
import { logError } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

export async function triggerBackup() {
  const user = await requireUser();
  if (!can(user.role, "user.manage")) throw new Error("FORBIDDEN");

  try {
    const result = await createBackup();
    await db.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "Backup", recordId: result.filename, newValue: { filename: result.filename } },
    });
    revalidatePath("/settings/backup");
  } catch (err) {
    logError("manual-backup", err);
    throw new Error("สำรองข้อมูลไม่สำเร็จ — ตรวจสอบว่าเครื่องนี้ติดตั้ง pg_dump ไว้แล้ว (ดู README)");
  }
}

// ⚠️ Destructive — ลบข้อมูลปัจจุบันทั้งหมดก่อน restore ทับ
export async function restoreFromUpload(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "user.manage")) throw new Error("FORBIDDEN");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("กรุณาเลือกไฟล์ backup (.dump)");

  const buffer = Buffer.from(await file.arrayBuffer());
  const tempPath = path.join(backupDir(), `restore-upload-${Date.now()}.dump`);
  fs.writeFileSync(tempPath, buffer);

  try {
    await restoreBackup(tempPath);
    await db.auditLog.create({
      data: { userId: user.id, action: "UPDATE", module: "Backup", recordId: "restore", newValue: { restoredFromFile: file.name } },
    });
  } catch (err) {
    logError("restore", err);
    throw new Error("Restore ไม่สำเร็จ — ตรวจสอบว่าไฟล์ backup ถูกต้องและเครื่องนี้ติดตั้ง pg_restore ไว้แล้ว");
  } finally {
    fs.unlinkSync(tempPath);
  }

  revalidatePath("/");
}
