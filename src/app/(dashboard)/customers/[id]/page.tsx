import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateCustomer } from "../actions";

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const customer = await db.customer.findUnique({ where: { id: params.id } });
  if (!customer) notFound();

  const updateWithId = updateCustomer.bind(null, customer.id);

  return (
    <div className="max-w-2xl">
      <a href="/customers" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการลูกค้า
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขลูกค้า: {customer.companyName}</h1>

      <form action={updateWithId} className="bg-white border rounded-lg p-4 grid grid-cols-2 gap-3">
        <Field label="รหัสลูกค้า *" name="code" defaultValue={customer.code} required autoFocus />
        <Field label="ชื่อบริษัท *" name="companyName" defaultValue={customer.companyName} required />
        <Field label="เลขประจำตัวผู้เสียภาษี" name="taxId" defaultValue={customer.taxId ?? ""} />
        <Field label="เบอร์โทร" name="phone" defaultValue={customer.phone ?? ""} />
        <Field label="อีเมล" name="email" type="email" defaultValue={customer.email ?? ""} />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">เงื่อนไขเครดิต</label>
          <select
            name="creditTerm"
            defaultValue={customer.creditTerm}
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            <option value="CASH">เงินสด</option>
            <option value="NET30">เครดิต 30 วัน</option>
            <option value="NET60">เครดิต 60 วัน</option>
            <option value="NET90">เครดิต 90 วัน</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
          <textarea
            name="note"
            rows={2}
            defaultValue={customer.note ?? ""}
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div className="col-span-2 flex gap-2">
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
            บันทึกการแก้ไข
          </button>
          <a
            href="/customers"
            className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border"
          >
            ยกเลิก
          </a>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  autoFocus = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
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
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
