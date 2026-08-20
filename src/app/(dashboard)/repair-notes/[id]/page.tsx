import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { cancelRepairReturnNote } from "../actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

export default async function RepairNoteDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "repairNote.create")) redirect("/");

  const note = await db.repairReturnNote.findUnique({ where: { id: params.id }, include: { items: true } });
  if (!note) notFound();

  const status = STATUS_LABEL[note.status];
  const cancelAction = cancelRepairReturnNote.bind(null, note.id);

  return (
    <div className="max-w-3xl">
      <a href="/repair-notes" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการ
      </a>

      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold font-mono">{note.noteNumber}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {note.customerNameSnapshot} · {note.noteDate.toLocaleDateString("th-TH")}
        {note.reference && <> · อ้างอิง: {note.reference}</>}
      </p>

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รายการ</th>
              <th className="px-4 py-2 font-medium text-right">จำนวน</th>
              <th className="px-4 py-2 font-medium">หน่วย</th>
            </tr>
          </thead>
          <tbody>
            {note.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2">{item.description}</td>
                <td className="px-4 py-2 text-right">{Number(item.quantity)}</td>
                <td className="px-4 py-2">{item.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {note.remark && <p className="text-sm text-gray-500 mb-4">หมายเหตุ: {note.remark}</p>}

      <div className="flex gap-2">
        <a
          href={`/repair-notes/${note.id}/print`}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          พิมพ์เอกสาร
        </a>
        {note.status !== "CANCELLED" && (
          <form action={cancelAction}>
            <button className="text-sm text-gray-600 hover:text-red-600 border rounded px-4 py-2">ยกเลิก</button>
          </form>
        )}
      </div>
    </div>
  );
}
