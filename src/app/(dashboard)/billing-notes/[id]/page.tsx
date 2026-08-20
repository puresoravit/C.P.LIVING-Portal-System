import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { cancelBillingNote } from "../actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

const CREDIT_DAYS: Record<string, number> = { CASH: 0, NET30: 30, NET60: 60, NET90: 90 };

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function BillingNoteDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "billingNote.create")) redirect("/");

  const note = await db.billingNote.findUnique({
    where: { id: params.id },
    include: { invoices: true },
  });
  if (!note) notFound();

  const creditDays = CREDIT_DAYS[note.creditTermSnapshot] ?? 0;
  const status = STATUS_LABEL[note.status];
  const cancelAction = cancelBillingNote.bind(null, note.id);

  return (
    <div className="max-w-3xl">
      <a href="/billing-notes" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบวางบิล
      </a>

      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold font-mono">{note.billingNoteNumber}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {note.customerNameSnapshot} · {note.billingNoteDate.toLocaleDateString("th-TH")}
      </p>

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">วันครบกำหนด</th>
              <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {note.invoices.map((inv) => (
              <tr key={inv.id} className="border-t">
                <td className="px-4 py-2">
                  <a href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
                    {inv.invoiceNumber}
                  </a>
                </td>
                <td className="px-4 py-2">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2">{addDays(inv.invoiceDate, creditDays).toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td colSpan={3} className="px-4 py-2 text-right">
                รวม
              </td>
              <td className="px-4 py-2 text-right">{money(note.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex gap-2">
        <a
          href={`/billing-notes/${note.id}/print`}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          พิมพ์เอกสาร
        </a>
        {note.status !== "CANCELLED" && (
          <form action={cancelAction}>
            <button className="text-sm text-gray-600 hover:text-red-600 border rounded px-4 py-2">
              ยกเลิก (Invoice จะกลับไปวางบิลใหม่ได้)
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
