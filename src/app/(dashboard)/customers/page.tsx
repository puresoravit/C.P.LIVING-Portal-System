import { db } from "@/lib/db";
import { createCustomer, toggleCustomerActive } from "./actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField, TextareaField } from "@/components/form/fields";

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
        <ActionForm action={createCustomer} successMessage="เพิ่มลูกค้าสำเร็จ" resetOnSuccess className="px-4 pb-4 grid grid-cols-2 gap-3">
          <Field label="รหัสลูกค้า *" name="code" required autoFocus />
          <Field label="ชื่อบริษัท *" name="companyName" required />
          <Field label="เลขประจำตัวผู้เสียภาษี" name="taxId" />
          <Field label="เบอร์โทร" name="phone" />
          <Field label="อีเมล" name="email" type="email" />
          <SelectField label="เงื่อนไขเครดิต" name="creditTerm" defaultValue="CASH">
            <option value="CASH">เงินสด</option>
            <option value="NET30">เครดิต 30 วัน</option>
            <option value="NET60">เครดิต 60 วัน</option>
            <option value="NET90">เครดิต 90 วัน</option>
          </SelectField>
          <div className="col-span-2">
            <TextareaField label="หมายเหตุ" name="note" />
          </div>
          <div className="col-span-2">
            <SubmitButton>บันทึกลูกค้า</SubmitButton>
          </div>
        </ActionForm>
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
