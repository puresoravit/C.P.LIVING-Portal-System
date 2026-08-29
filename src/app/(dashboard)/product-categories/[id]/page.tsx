import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProductCategory } from "../actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field } from "@/components/form/fields";
import { BackLink } from "@/components/back-link";

export default async function EditProductCategoryPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const category = await db.productCategory.findUnique({ where: { id: params.id } });
  if (!category) notFound();

  const updateWithId = updateProductCategory.bind(null, category.id);

  return (
    <div className="max-w-xl">
      <BackLink href="/product-categories">← กลับไปรายการประเภทสินค้า</BackLink>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขประเภทสินค้า: {category.name}</h1>

      <ActionForm
        action={updateWithId}
        successMessage="บันทึกการแก้ไขสำเร็จ"
        className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <Field label="รหัสประเภท *" name="code" defaultValue={category.code} required autoFocus />
        <Field label="ชื่อประเภท *" name="name" defaultValue={category.name} required />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="usesSize" defaultChecked={category.usesSize} className="rounded" />
          มีขนาด (Size) — ต้องเลือกไซส์ตอนคีย์เอกสาร
        </label>
        <Field label="ลำดับการแสดงผล" name="sortOrder" type="number" defaultValue={String(category.sortOrder)} />
        <div className="col-span-1 sm:col-span-2 flex gap-2">
          <SubmitButton>บันทึกการแก้ไข</SubmitButton>
          <a href="/product-categories" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </ActionForm>
    </div>
  );
}
