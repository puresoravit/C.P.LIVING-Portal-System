import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateCustomer } from "../actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField, TextareaField } from "@/components/form/fields";
import { BackLink } from "@/components/back-link";

export default async function EditCustomerPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const customer = await db.customer.findUnique({ where: { id: params.id } });
  if (!customer) notFound();

  const updateWithId = updateCustomer.bind(null, customer.id);

  return (
    <div className="max-w-2xl">
      <BackLink href="/customers">← กลับไปรายการลูกค้า</BackLink>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขลูกค้า: {customer.companyName}</h1>

      <ActionForm
        action={updateWithId}
        successMessage="บันทึกการแก้ไขสำเร็จ"
        className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <Field label="รหัสลูกค้า *" name="code" defaultValue={customer.code} required autoFocus />
        <Field label="ชื่อบริษัท *" name="companyName" defaultValue={customer.companyName} required />
        <Field label="เลขประจำตัวผู้เสียภาษี" name="taxId" defaultValue={customer.taxId ?? ""} />
        <Field label="เบอร์โทร" name="phone" defaultValue={customer.phone ?? ""} />
        <Field label="อีเมล" name="email" type="email" defaultValue={customer.email ?? ""} />
        <SelectField label="เงื่อนไขเครดิต" name="creditTerm" defaultValue={customer.creditTerm}>
          <option value="CASH">เงินสด</option>
          <option value="NET30">เครดิต 30 วัน</option>
          <option value="NET60">เครดิต 60 วัน</option>
          <option value="NET90">เครดิต 90 วัน</option>
        </SelectField>
        <div className="col-span-1 sm:col-span-2">
          <TextareaField label="สถานที่ส่งสินค้า (ใช้เมื่อสร้างเอกสารโดยไม่เลือกสาขา)" name="address" defaultValue={customer.address ?? ""} />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <TextareaField label="หมายเหตุ" name="note" defaultValue={customer.note ?? ""} />
        </div>
        <div className="col-span-1 sm:col-span-2 flex gap-2">
          <SubmitButton pendingLabel="กำลังบันทึก...">บันทึกการแก้ไข</SubmitButton>
          <a
            href="/customers"
            className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border"
          >
            ยกเลิก
          </a>
        </div>
      </ActionForm>
    </div>
  );
}
