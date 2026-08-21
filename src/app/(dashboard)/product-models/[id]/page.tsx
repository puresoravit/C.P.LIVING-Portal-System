import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProductModel } from "../actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";

export default async function EditProductModelPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [model, productTypes] = await Promise.all([
    db.productModel.findUnique({ where: { id: params.id } }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!model) notFound();

  const updateWithId = updateProductModel.bind(null, model.id);

  return (
    <div className="max-w-xl">
      <a href="/product-models" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการรุ่นสินค้า
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขรุ่นสินค้า: {model.name}</h1>

      <ActionForm
        action={updateWithId}
        successMessage="บันทึกการแก้ไขสำเร็จ"
        className="bg-white border rounded-lg p-4 grid grid-cols-2 gap-3"
      >
        <div className="col-span-2">
          <SelectField label="ประเภทสินค้า *" name="productTypeId" required defaultValue={model.productTypeId}>
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="col-span-2">
          <Field label="ชื่อรุ่นสินค้า *" name="name" defaultValue={model.name} required autoFocus />
        </div>
        <Field label="ลำดับการแสดงผล" name="sortOrder" type="number" defaultValue={String(model.sortOrder)} />
        <div className="col-span-2 flex gap-2">
          <SubmitButton>บันทึกการแก้ไข</SubmitButton>
          <a href="/product-models" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </ActionForm>
    </div>
  );
}
