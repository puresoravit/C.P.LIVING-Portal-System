import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { backupDir } from "@/lib/backup";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: { filename: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !can((session.user as any).role, "user.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // กัน Path Traversal — อนุญาตแค่ชื่อไฟล์รูปแบบที่ระบบสร้างเองเท่านั้น
  const filename = params.filename;
  if (!/^[\w.-]+\.dump$/.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filepath = path.join(backupDir(), filename);
  if (!fs.existsSync(filepath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filepath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
