import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateBranch } from "../actions";

export default async function EditBranchPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [branch, customers] = await Promise.all([
    db.branch.findUnique({ where: { id: params.id } }),
    db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } }),
  ]);
  if (!branch) notFound();

  const updateWithId = updateBranch.bind(null, branch.id);

  return (
    <div className="max-w-2xl">
      <a href="/branches" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการสาขา
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขสาขา: {branch.name}</h1>

      <form action={updateWithId} className="bg-white border rounded-lg p-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า *</label>
          <select
            name="customerId"
            required
            defaultValue={branch.customerId}
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <Field label="รหัสสาขา *" name="code" defaultValue={branch.code} required autoFocus />
        <Field label="ชื่อสาขา *" name="name" defaultValue={branch.name} required />
        <Field label="รหัสสาขาใบกำกับภาษี" name="taxBranchCode" defaultValue={branch.taxBranchCode ?? ""} />
        <Field label="เบอร์โทร" name="phone" defaultValue={branch.phone ?? ""} />
        <div className="col-span-2">
          <Field label="ที่อยู่" name="address" defaultValue={branch.address ?? ""} />
        </div>
        <Field label="จังหวัด" name="province" defaultValue={branch.province ?? ""} />
        <Field label="รหัสไปรษณีย์" name="postalCode" defaultValue={branch.postalCode ?? ""} />
        <Field label="ผู้ติดต่อ" name="contactPerson" defaultValue={branch.contactPerson ?? ""} />
        <div className="col-span-2 flex gap-2">
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
            บันทึกการแก้ไข
          </button>
          <a href="/branches" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
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
  required = false,
  autoFocus = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
