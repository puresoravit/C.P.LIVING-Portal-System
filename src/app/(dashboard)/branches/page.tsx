import { db } from "@/lib/db";
import { createBranch, toggleBranchActive } from "./actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";

export default async function BranchesPage(
  props: {
    searchParams: Promise<{ customerId?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const [branches, customers] = await Promise.all([
    db.branch.findMany({
      where: searchParams.customerId ? { customerId: searchParams.customerId } : undefined,
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    }),
    db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } }),
  ]);

  const selectedCustomer = customers.find((c) => c.id === searchParams.customerId);

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-1">สาขา</h1>
      {selectedCustomer && (
        <p className="text-sm text-gray-500 mb-4">
          กำลังดูสาขาของ <b>{selectedCustomer.companyName}</b> ·{" "}
          <a href="/branches" className="text-blue-600 hover:underline">
            ดูทั้งหมด
          </a>
        </p>
      )}

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ เพิ่มสาขาใหม่</summary>
        <ActionForm action={createBranch} successMessage="เพิ่มสาขาสำเร็จ" resetOnSuccess className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-1 sm:col-span-2">
            <SelectField label="ลูกค้า *" name="customerId" required defaultValue={searchParams.customerId ?? ""}>
              <option value="" disabled>
                เลือกลูกค้า
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName} ({c.code})
                </option>
              ))}
            </SelectField>
          </div>
          <Field label="รหัสสาขา *" name="code" required />
          <Field label="ชื่อสาขา *" name="name" required />
          <Field label="รหัสสาขาใบกำกับภาษี" name="taxBranchCode" />
          <Field label="เบอร์โทร" name="phone" />
          <div className="col-span-1 sm:col-span-2">
            <Field label="ที่อยู่" name="address" />
          </div>
          <Field label="จังหวัด" name="province" />
          <Field label="รหัสไปรษณีย์" name="postalCode" />
          <Field label="ผู้ติดต่อ" name="contactPerson" />
          <div className="col-span-1 sm:col-span-2">
            <SubmitButton>บันทึกสาขา</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รหัสสาขา</th>
              <th className="px-4 py-2 font-medium">ชื่อสาขา</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">จังหวัด</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-4 py-2 font-mono">{b.code}</td>
                <td className="px-4 py-2">{b.name}</td>
                <td className="px-4 py-2">{b.customer.companyName}</td>
                <td className="px-4 py-2">{b.province ?? "-"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                      b.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {b.active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <a href={`/branches/${b.id}`} className="text-xs text-blue-600 hover:underline">
                    แก้ไข
                  </a>
                  <form action={toggleBranchActive.bind(null, b.id)} className="inline">
                    <button className="text-xs text-gray-500 hover:text-red-600">
                      {b.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีข้อมูลสาขา
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
