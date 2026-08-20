import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function BillingNotesPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "billingNote.create")) redirect("/");

  const notes = await db.billingNote.findMany({
    include: { _count: { select: { invoices: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">ใบวางบิล</h1>
        <a
          href="/billing-notes/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          + สร้างใบวางบิล
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">รวม Invoice หลายใบของลูกค้า 1 ราย ที่ยังไม่เคยถูกวางบิลมาก่อน</p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">จำนวน Invoice</th>
              <th className="px-4 py-2 font-medium text-right">ยอดรวม</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => {
              const status = STATUS_LABEL[n.status];
              return (
                <tr key={n.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <a href={`/billing-notes/${n.id}`} className="font-mono text-blue-600 hover:underline">
                      {n.billingNoteNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2">{n.billingNoteDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2">{n.customerNameSnapshot}</td>
                  <td className="px-4 py-2">{n._count.invoices} ใบ</td>
                  <td className="px-4 py-2 text-right">{money(n.totalAmount)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                  </td>
                </tr>
              );
            })}
            {notes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีใบวางบิล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
