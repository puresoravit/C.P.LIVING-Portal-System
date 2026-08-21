import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProductModel, batchCreateProductVariants } from "../actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";
import { BatchSizeForm } from "@/components/batch-size-form";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function EditProductModelPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [model, productTypes, variants] = await Promise.all([
    db.productModel.findUnique({ where: { id: params.id } }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.product.findMany({ where: { modelId: params.id }, orderBy: { size: "asc" } }),
  ]);
  if (!model) notFound();

  const updateWithId = updateProductModel.bind(null, model.id);
  const batchSizeAction = batchCreateProductVariants.bind(null, model.id);
  const existingSizes = variants.map((v) => v.size ?? "");
  const commonUnit = variants[0]?.unit ?? "หลัง";

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

      {/* R4 — Size Architecture Path A: จัดการ Size ของรุ่นนี้ทั้งหมดในหน้าเดียว —
          Owner/Staff มองเป็น "รุ่นเดียว + หลาย Size" ไม่ต้องสร้าง Product ทีละ SKU */}
      <div className="bg-white border rounded-lg p-4 mt-4">
        <h2 className="font-medium text-sm mb-3">ไซส์ของรุ่นนี้</h2>
        {variants.length > 0 && (
          <div className="border rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">ไซส์</th>
                  <th className="px-3 py-2 font-medium text-right">ราคา</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-3 py-2 font-mono">{v.sku}</td>
                    <td className="px-3 py-2">{v.size ?? "ไม่มีขนาด"}</td>
                    <td className="px-3 py-2 text-right">{money(v.standardPrice)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          v.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {v.active ? "ใช้งาน" : "ปิดใช้งาน"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="font-medium text-xs text-gray-600 mb-2">เพิ่มไซส์ใหม่</h3>
        <BatchSizeForm modelId={model.id} existingSizes={existingSizes} defaultUnit={commonUnit} action={batchSizeAction} />
      </div>
    </div>
  );
}
