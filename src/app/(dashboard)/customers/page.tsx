import { db } from "@/lib/db";
import { createCustomer, toggleCustomerActive } from "./actions";

const CREDIT_TERM_LABEL: Record<string, string> = {
  CASH: "เงินสด",
  NET30: "เครดิต 30 วัน",
  NET60: "เครดิต 60 วัน",
  NET90: "เครดิต 90 วัน",
};

export default async function CustomersPage() {
  const customers = await db.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { branches: true } } },
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-4">ลูกค้า</h1>

      <details className="mb-6 bg-white border rounded-lg" open={customers.length === 0}>
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">
          + เพิ่มลูกค้าใหม่
        </summary>
        <form action={createCustomer} className="px-4 pb-4 grid grid-cols-2 gap-3">
          <Field label="รหัสลูกค้า *" name="code" required autoFocus />
          <Field label="ชื่อบริษัท *" name="companyName" required />
          <Field label="เลขประจำตัวผู้เสียภาษี" name="taxId" />
          <Field label="เบอร์โทร" name="phone" />
          <Field label="อีเมล" name="email" type="email" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">เงื่อนไขเครดิต</label>
            <select name="creditTerm" defaultValue="CASH" className="w-full border rounded px-3 py-1.5 text-sm">
              <option value="CASH">เงินสด</option>
              <option value="NET30">เครดิต 30 วัน</option>
              <option value="NET60">เครดิต 60 วัน</option>
              <option value="NET90">เครดิต 90 วัน</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
            <textarea name="note" rows={2} className="w-full border rounded px-3 py-1.5 text-sm" />
          </div>
          <div className="col-span-2">
            <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
              บันทึกลูกค้า
            </button>
          </div>
        </form>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รหัส</th>
              <th className="px-4 py-2 font-medium">ชื่อบริษัท</th>
              <th className="px-4 py-2 font-medium">เครดิต</th>
              <th className="px-4 py-2 font-medium">สาขา</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2 font-mono">{c.code}</td>
                <td className="px-4 py-2">
                  <a href={`/branches?customerId=${c.id}`} className="hover:underline">
                    {c.companyName}
                  </a>
                </td>
                <td className="px-4 py-2">{CREDIT_TERM_LABEL[c.creditTerm]}</td>
                <td className="px-4 py-2">{c._count.branches} สาขา</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      c.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {c.active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <a href={`/customers/${c.id}`} className="text-xs text-blue-600 hover:underline">
                    แก้ไข
                  </a>
                  <form action={toggleCustomerActive.bind(null, c.id)} className="inline">
                    <button className="text-xs text-gray-500 hover:text-red-600">
                      {c.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีข้อมูลลูกค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  autoFocus = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        autoFocus={autoFocus}
        className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
