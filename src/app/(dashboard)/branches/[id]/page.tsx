import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateBranch } from "../actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";
import { BackLink } from "@/components/back-link";

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
      <BackLink href="/branches">← กลับไปรายการสาขา</BackLink>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขสาขา: {branch.name}</h1>

      <ActionForm
        action={updateWithId}
        successMessage="บันทึกการแก้ไขสำเร็จ"
        className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <div className="col-span-1 sm:col-span-2">
          <SelectField label="ลูกค้า *" name="customerId" required defaultValue={branch.customerId}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName} ({c.code})
              </option>
            ))}
          </SelectField>
        </div>
        <Field label="รหัสสาขา *" name="code" defaultValue={branch.code} required autoFocus />
        <Field label="ชื่อสาขา *" name="name" defaultValue={branch.name} required />
        <Field label="รหัสสาขาใบกำกับภาษี" name="taxBranchCode" defaultValue={branch.taxBranchCode ?? ""} />
        <Field label="เบอร์โทร" name="phone" defaultValue={branch.phone ?? ""} />
        <div className="col-span-1 sm:col-span-2">
          <Field label="ที่อยู่" name="address" defaultValue={branch.address ?? ""} />
        </div>
        <Field label="จังหวัด" name="province" defaultValue={branch.province ?? ""} />
        <Field label="รหัสไปรษณีย์" name="postalCode" defaultValue={branch.postalCode ?? ""} />
        <Field label="ผู้ติดต่อ" name="contactPerson" defaultValue={branch.contactPerson ?? ""} />
        <div className="col-span-1 sm:col-span-2 flex gap-2">
          <SubmitButton>บันทึกการแก้ไข</SubmitButton>
          <a href="/branches" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </ActionForm>
    </div>
  );
}
