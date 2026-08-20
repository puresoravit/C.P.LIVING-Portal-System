import { db } from "@/lib/db";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function TaxInvoicesPage() {
  const taxInvoices = await db.taxInvoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">ใบกำกับภาษี</h1>
        <a
          href="/tax-invoices/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
        >
          + สร้างใบกำกับภาษี (เลือกรายการเอง)
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        ส่วนใหญ่ลูกค้าจะแจ้งรายการ/ยอดเองว่าต้องการใบกำกับภาษีเท่าไร — ใช้ปุ่มด้านบนสร้างแบบเลือกเอง
        หรือถ้าลูกค้าขอ VAT เต็ม 100% ของยอด ให้กด &quot;สร้างใบกำกับภาษีจากใบนี้&quot; จากหน้ารายละเอียด Invoice แทน
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">อ้างอิง Invoice</th>
              <th className="px-4 py-2 font-medium text-right">มูลค่าสินค้า</th>
              <th className="px-4 py-2 font-medium text-right">VAT</th>
              <th className="px-4 py-2 font-medium text-right">สุทธิ</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {taxInvoices.map((tx) => {
              const status = STATUS_LABEL[tx.status];
              return (
                <tr key={tx.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <a href={`/tax-invoices/${tx.id}`} className="font-mono text-blue-600 hover:underline">
                      {tx.taxInvoiceNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2">{tx.taxInvoiceDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2">{tx.customerNameSnapshot}</td>
                  <td className="px-4 py-2 text-gray-400">{tx.referenceInvoiceId ? "Auto" : "Manual"}</td>
                  <td className="px-4 py-2 text-right">{money(tx.valueAmount)}</td>
                  <td className="px-4 py-2 text-right">{money(tx.vatAmount)}</td>
                  <td className="px-4 py-2 text-right">{money(tx.netAmount)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                  </td>
                </tr>
              );
            })}
            {taxInvoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีใบกำกับภาษี
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
