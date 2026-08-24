import { db } from "@/lib/db";
import { createProductModel, toggleProductModelActive } from "./actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";

export default async function ProductModelsPage() {
  const [models, productTypes, categories] = await Promise.all([
    db.productModel.findMany({
      orderBy: [{ productTypeId: "asc" }, { sortOrder: "asc" }],
      include: { productType: true, category: true, _count: { select: { products: true } } },
    }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">รุ่นสินค้า (Product Model)</h1>
      <p className="text-sm text-gray-500 mb-4">
        ใช้จัดกลุ่ม SKU/ขนาดต่างๆ ของสินค้าที่เป็น &quot;รุ่นเดียวกัน&quot; เช่น GT-David ขนาด 3.5/5/6
        ฟุต ให้รวมยอดขายเป็นรุ่นเดียวใน Dashboard/รายงาน
      </p>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ เพิ่มรุ่นสินค้าใหม่</summary>
        <ActionForm id="createProductModelForm" action={createProductModel} successMessage="เพิ่มรุ่นสินค้าสำเร็จ" resetOnSuccess className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField label="กลุ่มส่วนลด *" name="productTypeId" required defaultValue="">
            <option value="" disabled>
              เลือกกลุ่มส่วนลด
            </option>
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="ประเภทสินค้า (ถ้ามี)" name="categoryId" defaultValue="">
            <option value="">— ไม่ระบุประเภทสินค้า —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Field label="ชื่อรุ่นสินค้า * (เช่น GT-David)" name="name" required />
          <Field label="ลำดับการแสดงผล" name="sortOrder" type="number" />
          <div className="col-span-1 sm:col-span-2 pricePerFootFields hidden bg-blue-50 border border-blue-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-1 sm:col-span-2 text-xs text-blue-800">
              ประเภทสินค้านี้มีขนาด (Size) — กำหนดราคาต่อฟุตเพื่อสร้าง/อัปเดตราคา Standard Variant
              (3 / 3.5 / 4 / 5 / 6 ฟุต) ให้อัตโนมัติ (เว้นว่างได้ถ้ายังไม่ต้องการตั้งตอนนี้)
            </div>
            <Field label="ราคาต่อฟุต (บาท)" name="pricePerFoot" type="number" />
            <Field label="หน่วยนับของ Variant (เช่น หลัง)" name="variantUnit" />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <SubmitButton>บันทึกรุ่นสินค้า</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
              <th className="px-4 py-2 font-medium">ประเภทสินค้า</th>
              <th className="px-4 py-2 font-medium">ชื่อรุ่น</th>
              <th className="px-4 py-2 font-medium">จำนวนรหัสสินค้า</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-2">{m.productType.name}</td>
                <td className="px-4 py-2">
                  {m.category ? m.category.name : <span className="text-gray-400">— ไม่ระบุ —</span>}
                </td>
                <td className="px-4 py-2">{m.name}</td>
                <td className="px-4 py-2">{m._count.products} รหัสสินค้า</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      m.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {m.active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <a href={`/product-models/${m.id}`} className="text-xs text-blue-600 hover:underline">
                    แก้ไข
                  </a>
                  <form action={toggleProductModelActive.bind(null, m.id)} className="inline">
                    <button className="text-xs text-gray-500 hover:text-red-600">
                      {m.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีรุ่นสินค้า — สินค้าที่ยังไม่ได้กำหนดรุ่นจะแสดงแยกเป็นรายการของตัวเองใน Dashboard
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* R6 Phase B — โชว์/ซ่อนช่องราคาต่อฟุตตาม Category ที่เลือก (usesSize) — Pattern
          เดียวกับ Type→Model dependent dropdown เดิมของหน้านี้ ไม่มี Business Logic ใหม่ */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const categoriesUsesSize = ${safeJsonForScript(Object.fromEntries(categories.map((c) => [c.id, c.usesSize])))};
            const categorySelect = document.querySelector('#createProductModelForm select[name="categoryId"]');
            const pricePerFootFields = document.querySelector('#createProductModelForm .pricePerFootFields');
            function updatePricePerFootVisibility() {
              const usesSize = categoriesUsesSize[categorySelect.value] === true;
              pricePerFootFields.classList.toggle('hidden', !usesSize);
            }
            categorySelect.addEventListener('change', updatePricePerFootVisibility);
            updatePricePerFootVisibility();
          `,
        }}
      />
    </div>
  );
}
