import { db } from "@/lib/db";
import { createProductModel, toggleProductModelActive } from "./actions";

export default async function ProductModelsPage() {
  const [models, productTypes] = await Promise.all([
    db.productModel.findMany({
      orderBy: [{ productTypeId: "asc" }, { sortOrder: "asc" }],
      include: { productType: true, _count: { select: { products: true } } },
    }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
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
        <form action={createProductModel} className="px-4 pb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ประเภทสินค้า *</label>
            <select name="productTypeId" required defaultValue="" className="w-full border rounded px-3 py-1.5 text-sm">
              <option value="" disabled>
                เลือกประเภทสินค้า
              </option>
              {productTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อรุ่นสินค้า * (เช่น GT-David)</label>
            <input name="name" required className="w-full border rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ลำดับการแสดงผล</label>
            <input name="sortOrder" type="number" className="w-full border rounded px-3 py-1.5 text-sm" />
          </div>
          <div className="col-span-2">
            <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
              บันทึกรุ่นสินค้า
            </button>
          </div>
        </form>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">ประเภทสินค้า</th>
              <th className="px-4 py-2 font-medium">ชื่อรุ่น</th>
              <th className="px-4 py-2 font-medium">จำนวน SKU</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-2">{m.productType.name}</td>
                <td className="px-4 py-2">{m.name}</td>
                <td className="px-4 py-2">{m._count.products} SKU</td>
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
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีรุ่นสินค้า — สินค้าที่ยังไม่ได้กำหนดรุ่นจะแสดงแยกเป็นรายการของตัวเองใน Dashboard
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
