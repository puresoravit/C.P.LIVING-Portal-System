import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

const ACTION_LABEL: Record<string, string> = {
  CREATE: "สร้าง",
  UPDATE: "แก้ไข",
  DELETE: "ลบ",
  CANCEL: "ยกเลิก",
  CONFIRM: "ยืนยัน",
  ACTIVATE: "เปิดใช้งาน",
  DEACTIVATE: "ปิดใช้งาน",
};

const ACTION_COLOR: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  CANCEL: "bg-red-100 text-red-700",
  CONFIRM: "bg-green-100 text-green-700",
  ACTIVATE: "bg-green-100 text-green-700",
  DEACTIVATE: "bg-gray-100 text-gray-600",
};

export default async function AuditLogPage(
  props: {
    searchParams: Promise<{ module?: string; userId?: string; dateFrom?: string; dateTo?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "auditLog.view")) redirect("/");

  const [logs, modules, users] = await Promise.all([
    db.auditLog.findMany({
      where: {
        module: searchParams.module || undefined,
        userId: searchParams.userId || undefined,
        createdAt: {
          gte: searchParams.dateFrom ? new Date(searchParams.dateFrom) : undefined,
          lte: searchParams.dateTo ? new Date(searchParams.dateTo) : undefined,
        },
      },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.auditLog.findMany({ select: { module: true }, distinct: ["module"] }),
    db.user.findMany({ select: { id: true, displayName: true } }),
  ]);

  return (
    <div className="max-w-6xl">
      <h1 className="text-lg font-semibold mb-1">Audit Log</h1>
      <p className="text-sm text-gray-500 mb-4">ประวัติการแก้ไขข้อมูลสำคัญทั้งหมดในระบบ (แสดงล่าสุด 200 รายการ)</p>

      <form className="bg-white border rounded-lg p-4 grid grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">โมดูล</label>
          <select name="module" defaultValue={searchParams.module ?? ""} className="w-full border rounded px-3 py-1.5 text-sm">
            <option value="">ทั้งหมด</option>
            {modules.map((m) => (
              <option key={m.module} value={m.module}>
                {m.module}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ผู้ใช้</label>
          <select name="userId" defaultValue={searchParams.userId ?? ""} className="w-full border rounded px-3 py-1.5 text-sm">
            <option value="">ทั้งหมด</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่เริ่ม</label>
          <input name="dateFrom" type="date" defaultValue={searchParams.dateFrom} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่สิ้นสุด</label>
          <input name="dateTo" type="date" defaultValue={searchParams.dateTo} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="col-span-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">ค้นหา</button>
        </div>
      </form>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เวลา</th>
              <th className="px-4 py-2 font-medium">ผู้ใช้</th>
              <th className="px-4 py-2 font-medium">การกระทำ</th>
              <th className="px-4 py-2 font-medium">โมดูล</th>
              <th className="px-4 py-2 font-medium">Record ID</th>
              <th className="px-4 py-2 font-medium">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t align-top">
                <td className="px-4 py-2 whitespace-nowrap">
                  {log.createdAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-2">{log.user.displayName}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ACTION_COLOR[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                    {ACTION_LABEL[log.action] ?? log.action}
                  </span>
                </td>
                <td className="px-4 py-2">{log.module}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{log.recordId.slice(0, 12)}...</td>
                <td className="px-4 py-2">
                  <details>
                    <summary className="cursor-pointer text-xs text-blue-600">ดูรายละเอียด</summary>
                    <div className="text-xs mt-1 space-y-1">
                      {log.oldValue ? (
                        <div>
                          <span className="text-gray-500">ก่อน:</span>{" "}
                          <code className="bg-red-50 px-1 rounded">{JSON.stringify(log.oldValue)}</code>
                        </div>
                      ) : null}
                      {log.newValue ? (
                        <div>
                          <span className="text-gray-500">หลัง:</span>{" "}
                          <code className="bg-green-50 px-1 rounded">{JSON.stringify(log.newValue)}</code>
                        </div>
                      ) : null}
                    </div>
                  </details>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
