import { db } from "@/lib/db";
import { createBillingNoteAction } from "../actions";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function NewBillingNotePage({ searchParams }: { searchParams: { customerId?: string } }) {
  const customers = await db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } });

  const selectedCustomerId = searchParams.customerId;
  const eligibleInvoices = selectedCustomerId
    ? await db.invoice.findMany({
        where: { customerId: selectedCustomerId, billingNoteId: null, status: { not: "CANCELLED" } },
        orderBy: { invoiceDate: "asc" },
      })
    : [];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl">
      <a href="/billing-notes" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบวางบิล
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">สร้างใบวางบิล</h1>
      <p className="text-sm text-gray-500 mb-4">
        เลือกลูกค้าเพื่อดู Invoice ที่ยังไม่เคยถูกวางบิล แล้วติ๊กใบที่ต้องการรวมเป็นใบวางบิลเดียว
      </p>

      <form method="get" className="bg-white border rounded-lg p-4 mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า</label>
        <select
          name="customerId"
          defaultValue={selectedCustomerId ?? ""}
          className="w-full border rounded px-3 py-1.5 text-sm"
        >
          <option value="" disabled>
            เลือกลูกค้า
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName} ({c.code})
            </option>
          ))}
        </select>
        <button className="mt-2 text-sm text-blue-600 hover:underline">ดู Invoice ที่ยังไม่วางบิล</button>
      </form>

      {selectedCustomerId && (
        <form action={createBillingNoteAction}>
          <input type="hidden" name="customerId" value={selectedCustomerId} />
          <div className="bg-white border rounded-lg p-4 mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">วันที่วางบิล *</label>
            <input name="billingNoteDate" type="date" defaultValue={today} required className="border rounded px-3 py-1.5 text-sm" />
          </div>

          <div className="bg-white border rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
                  <th className="px-4 py-2 font-medium">วันที่</th>
                  <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {eligibleInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="px-4 py-2">
                      <input type="checkbox" name="invoiceIds" value={inv.id} defaultChecked />
                    </td>
                    <td className="px-4 py-2 font-mono">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>
                    <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
                  </tr>
                ))}
                {eligibleInvoices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      ลูกค้ารายนี้ไม่มี Invoice ที่รอวางบิล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {eligibleInvoices.length > 0 && (
            <button className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded px-4 py-2">
              ✓ สร้างใบวางบิลจากรายการที่เลือก
            </button>
          )}
        </form>
      )}
    </div>
  );
}
