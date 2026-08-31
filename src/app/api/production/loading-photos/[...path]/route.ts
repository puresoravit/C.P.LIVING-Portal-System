import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

// CP2 — เสิร์ฟรูปหลักฐานแบบต้อง login (ไฟล์อยู่นอก public/ โดยเจตนา — รูปใบขึ้นของเป็น
// ข้อมูลภายใน ไม่ปล่อยเป็น URL สาธารณะ) — กัน path traversal ด้วยการ resolve แล้วเช็ค
// ว่ายังอยู่ใต้ UPLOAD_ROOT เสมอ

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

export async function GET(_req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const params = await props.params;
  const relPath = params.path.join("/");
  const absPath = path.resolve(UPLOAD_ROOT, relPath);
  if (!absPath.startsWith(UPLOAD_ROOT + path.sep)) {
    return NextResponse.json({ error: "BAD_PATH" }, { status: 400 });
  }
  const contentType = CONTENT_TYPES[path.extname(absPath).toLowerCase()];
  if (!contentType) return NextResponse.json({ error: "BAD_TYPE" }, { status: 400 });

  try {
    const data = await readFile(absPath);
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
