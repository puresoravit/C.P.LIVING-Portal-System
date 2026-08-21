import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProductModel } from "../actions";

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

      <form action={updateWithId} className="bg-white border rounded-lg p-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ประเภทสินค้า *</label>
          <select
            name="productTypeId"
            required
            defaultValue={model.productTypeId}
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อรุ่นสินค้า *</label>
          <input
            name="name"
            defaultValue={model.name}
            required
            autoFocus
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ลำดับการแสดงผล</label>
          <input
            name="sortOrder"
            type="number"
            defaultValue={String(model.sortOrder)}
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div className="col-span-2 flex gap-2">
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
            บันทึกการแก้ไข
          </button>
          <a href="/product-models" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </form>
    </div>
  );
}
