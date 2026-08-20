import { db } from "@/lib/db";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

export default async function RepairNotesPage() {
  const notes = await db.repairReturnNote.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">ใบส่งคืนสินค้าฝากซ่อม</h1>
        <a
          href="/repair-notes/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          + สร้างใหม่
        </a>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">อ้างอิง</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => {
              const status = STATUS_LABEL[n.status];
              return (
                <tr key={n.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <a href={`/repair-notes/${n.id}`} className="font-mono text-blue-600 hover:underline">
                      {n.noteNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2">{n.noteDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2">{n.customerNameSnapshot}</td>
                  <td className="px-4 py-2 text-gray-500">{n.reference ?? "-"}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                  </td>
                </tr>
              );
            })}
            {notes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีเอกสาร
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
