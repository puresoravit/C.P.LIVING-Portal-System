import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "ยืนยันแล้ว", className: "bg-green-100 text-green-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-blue-100 text-blue-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function InvoicesPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const invoices = await db.invoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-1">ใบส่งของชั่วคราว (Invoice)</h1>
      <p className="text-sm text-gray-500 mb-4">
        แตกอัตโนมัติจาก Order ตอน Confirm — แยกใบตามประเภทสินค้า (Type) เสมอ
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">ประเภท</th>
              <th className="px-4 py-2 font-medium text-right">ยอดสุทธิ</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const status = STATUS_LABEL[inv.status];
              return (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <a href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
                      {inv.invoiceNumber}
                    </a>
                  </td>
                  <td className="px-4 py-2">{inv.invoiceDate.toLocaleDateString("th-TH")}</td>
                  <td className="px-4 py-2">{inv.customerNameSnapshot}</td>
                  <td className="px-4 py-2">{inv.productTypeCode}</td>
                  <td className="px-4 py-2 text-right">{money(inv.grandTotal)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                  </td>
                </tr>
              );
            })}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มี Invoice — จะถูกสร้างอัตโนมัติเมื่อ Confirm Order
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
