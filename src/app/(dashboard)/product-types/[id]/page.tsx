import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProductType } from "../actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field } from "@/components/form/fields";

export default async function EditProductTypePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const productType = await db.productType.findUnique({ where: { id: params.id } });
  if (!productType) notFound();

  const updateWithId = updateProductType.bind(null, productType.id);

  return (
    <div className="max-w-xl">
      <a href="/product-types" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการกลุ่มส่วนลด
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขกลุ่มส่วนลด: {productType.name}</h1>

      <ActionForm
        action={updateWithId}
        successMessage="บันทึกการแก้ไขสำเร็จ"
        className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <Field label="รหัสกลุ่ม *" name="code" defaultValue={productType.code} required autoFocus />
        <Field label="ชื่อกลุ่ม *" name="name" defaultValue={productType.name} required />
        <div className="col-span-1 sm:col-span-2">
          <Field label="คำอธิบาย" name="description" defaultValue={productType.description ?? ""} />
        </div>
        <Field label="ลำดับการแสดงผล" name="sortOrder" type="number" defaultValue={String(productType.sortOrder)} />
        <div className="col-span-1 sm:col-span-2 flex gap-2">
          <SubmitButton>บันทึกการแก้ไข</SubmitButton>
          <a href="/product-types" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </ActionForm>
    </div>
  );
}
