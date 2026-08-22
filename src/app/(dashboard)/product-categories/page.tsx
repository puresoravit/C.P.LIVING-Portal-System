import { db } from "@/lib/db";
import { createProductCategory, toggleProductCategoryActive } from "./actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field } from "@/components/form/fields";

export default async function ProductCategoriesPage() {
  const categories = await db.productCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true, models: true } } },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">ประเภทสินค้า (Product Category)</h1>
      <p className="text-sm text-gray-500 mb-4">
        จัดกลุ่มสินค้าตามคุณลักษณะจริง (เช่น ฟูกที่นอน / หมอน) — คนละแนวคิดกับ &quot;กลุ่มส่วนลด&quot;
        ที่ใช้แยกบิลอัตโนมัติ ประเภทที่เปิด &quot;มีขนาด (Size)&quot; จะให้เลือกไซส์ตอนคีย์เอกสาร
      </p>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ เพิ่มประเภทสินค้าใหม่</summary>
        <ActionForm action={createProductCategory} successMessage="เพิ่มประเภทสินค้าสำเร็จ" resetOnSuccess className="px-4 pb-4 grid grid-cols-2 gap-3">
          <Field label="รหัสประเภท * (เช่น MATTRESS)" name="code" required />
          <Field label="ชื่อประเภท * (เช่น ฟูกที่นอน)" name="name" required />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="usesSize" className="rounded" />
            มีขนาด (Size) — ต้องเลือกไซส์ตอนคีย์เอกสาร
          </label>
          <Field label="ลำดับการแสดงผล" name="sortOrder" type="number" />
          <div className="col-span-2">
            <SubmitButton>บันทึกประเภทสินค้า</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รหัส</th>
              <th className="px-4 py-2 font-medium">ชื่อ</th>
              <th className="px-4 py-2 font-medium">มีขนาด</th>
              <th className="px-4 py-2 font-medium">จำนวนสินค้า/รุ่น</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2 font-mono">{c.code}</td>
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">{c.usesSize ? "✓ มีขนาด" : <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-2">{c._count.products} สินค้า / {c._count.models} รุ่น</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      c.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {c.active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <a href={`/product-categories/${c.id}`} className="text-xs text-blue-600 hover:underline">
                    แก้ไข
                  </a>
                  <form action={toggleProductCategoryActive.bind(null, c.id)} className="inline">
                    <button className="text-xs text-gray-500 hover:text-red-600">
                      {c.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีประเภทสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
