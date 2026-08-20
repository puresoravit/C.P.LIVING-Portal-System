import { listBackups } from "@/lib/backup";
import { triggerBackup, restoreFromUpload } from "./actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function BackupPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "user.manage")) redirect("/");

  const backups = listBackups();

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">สำรอง/กู้คืนข้อมูล</h1>
      <p className="text-sm text-gray-500 mb-4">
        สำรองฐานข้อมูลทั้งหมดเป็นไฟล์ .dump — สำหรับตั้งค่าให้สำรองอัตโนมัติทุกวัน ดูวิธีตั้งค่าใน README
        (`/api/backup/auto`)
      </p>

      <form action={triggerBackup} className="mb-6">
        <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
          สำรองข้อมูลตอนนี้
        </button>
      </form>

      <div className="bg-white border rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">ไฟล์</th>
              <th className="px-4 py-2 font-medium">ขนาด</th>
              <th className="px-4 py-2 font-medium">วันที่สำรอง</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.filename} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{b.filename}</td>
                <td className="px-4 py-2">{formatSize(b.sizeBytes)}</td>
                <td className="px-4 py-2">{b.createdAt.toLocaleString("th-TH")}</td>
                <td className="px-4 py-2 text-right">
                  <a href={`/api/backup/download/${b.filename}`} className="text-blue-600 hover:underline text-xs">
                    ดาวน์โหลด
                  </a>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีไฟล์ Backup
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h2 className="font-medium text-sm text-red-700 mb-2">⚠️ กู้คืนข้อมูล (อันตราย — ใช้ในกรณีฉุกเฉินเท่านั้น)</h2>
        <p className="text-xs text-red-600 mb-3">
          การ Restore จะ<b>ลบข้อมูลปัจจุบันทั้งหมด</b>แล้วแทนที่ด้วยข้อมูลจากไฟล์ backup ที่เลือก
          ไม่สามารถย้อนกลับได้ — ควรสำรองข้อมูลปัจจุบันไว้ก่อนเสมอ
        </p>
        <form action={restoreFromUpload} encType="multipart/form-data" className="flex gap-2 items-center">
          <input type="file" name="file" accept=".dump" required className="text-sm" />
          <button className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded px-4 py-2">
            Restore จากไฟล์นี้
          </button>
        </form>
      </div>
    </div>
  );
}
