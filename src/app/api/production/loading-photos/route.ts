import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// CP2 — อัปโหลดรูปใบขึ้นของที่ขีดนับแล้ว (หลักฐานประกอบการยืนยันขึ้นของ ตามกฎ "หลักฐาน
// มาก่อนตัวเลข") — ใช้ Route Handler แทน Server Action เพราะรูปจากมือถือใหญ่กว่า body
// limit ของ server action (1MB) — ไฟล์เก็บนอก public/ (ต้อง login ถึงดูได้ ผ่าน GET
// route ข้างล่าง ไม่ใช่ static URL สาธารณะ)
//
// การ push เข้า photoPaths เป็น append-only (Prisma { push }) ไม่ใช้ version CAS โดยเจตนา:
// สองคนอัปโหลดพร้อมกันได้ทั้งคู่ ไม่มี lost update (commutative) — แต่สถานะเที่ยวยังถูก
// guard ใน transaction: เพิ่มรูปได้เฉพาะเที่ยวที่ยังไม่ถูกยกเลิก/ยังไม่กระทบยอด (เพิ่มหลัง
// ยืนยันขึ้นของได้ — หลักฐานเสริมก่อนกระทบยอด CP3)

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id as string | undefined;
  if (!session || !userId || !can(role, "loadingTrip.manage")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const formData = await req.formData();
  const tripId = String(formData.get("tripId") || "");
  const dropId = String(formData.get("dropId") || "");
  const file = formData.get("file");
  if (!tripId || !dropId || !(file instanceof File)) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะไฟล์รูปภาพ (JPG/PNG/WebP/HEIC)" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 15MB" }, { status: 400 });

  const relPath = `loading/${tripId}/${randomUUID()}${ext}`;
  const absPath = path.join(UPLOAD_ROOT, relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, Buffer.from(await file.arrayBuffer()));

  try {
    await db.$transaction(async (tx) => {
      const drop = await tx.loadingDrop.findFirst({
        where: { id: dropId, tripId, trip: { cancelledAt: null, reconciledAt: null } },
        select: { id: true, customerId: true, branchId: true },
      });
      if (!drop) throw new Error("DROP_NOT_ELIGIBLE");
      await tx.loadingDrop.update({ where: { id: dropId }, data: { photoPaths: { push: relPath } } });
      await tx.auditLog.create({
        data: {
          userId,
          action: "UPDATE",
          module: "LoadingTrip",
          recordId: tripId,
          customerId: drop.customerId,
          branchId: drop.branchId,
          newValue: { event: "ADD_PHOTO", path: relPath },
        },
      });
    });
  } catch {
    return NextResponse.json({ error: "จุดส่งไม่ถูกต้อง หรือเที่ยวถูกยกเลิก/กระทบยอดไปแล้ว" }, { status: 409 });
  }

  return NextResponse.json({ path: relPath });
}
