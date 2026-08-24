import { readRecentLogs } from "@/lib/logger";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function SystemLogsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "user.manage")) redirect("/");

  const logs = readRecentLogs(200);

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-1">System Logs</h1>
      <p className="text-sm text-gray-500 mb-1">Error Log ล่าสุด 200 รายการ (ไม่แสดงรหัสผ่านหรือข้อมูลอ่อนไหว)</p>
      <p className="text-xs text-gray-400 mb-4">
        หน้านี้อ่านจากไฟล์ในเครื่อง server — ถ้า deploy บน Cloud ที่ local disk เป็นแบบ ephemeral
        (หายเมื่อ restart/redeploy) รายการที่เห็นอาจไม่ครบ ให้ดู log เต็มจาก log viewer ของ hosting platform แทน
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        {logs.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">ยังไม่มี Error Log — เป็นสัญญาณที่ดีครับ</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-4 py-2 font-medium">จุดที่เกิด</th>
                <th className="px-4 py-2 font-medium">ข้อความ</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-xs">
                    {typeof log.timestamp === "string" ? new Date(log.timestamp).toLocaleString("th-TH") : "-"}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono">{String(log.context ?? "-")}</td>
                  <td className="px-4 py-2 text-xs text-red-700">{String(log.message ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
