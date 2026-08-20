import { db } from "@/lib/db";
import { createProductType, toggleProductTypeActive } from "./actions";

export default async function ProductTypesPage() {
  const productTypes = await db.productType.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">ประเภทสินค้า</h1>
      <p className="text-sm text-gray-500 mb-4">
        ระบบใช้ประเภทสินค้าเหล่านี้แยกบิลอัตโนมัติตอน Confirm Order — เพิ่มประเภทใหม่ได้เองที่นี่
        โดยไม่ต้องแก้โปรแกรม
      </p>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ เพิ่มประเภทสินค้าใหม่</summary>
        <form action={createProductType} className="px-4 pb-4 grid grid-cols-2 gap-3">
          <Field label="รหัสประเภท * (เช่น D)" name="code" required />
          <Field label="ชื่อประเภท * (เช่น TYPE D)" name="name" required />
          <div className="col-span-2">
            <Field label="คำอธิบาย" name="description" />
          </div>
          <Field label="ลำดับการแสดงผล" name="sortOrder" type="number" />
          <div className="col-span-2">
            <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
              บันทึกประเภทสินค้า
            </button>
          </div>
        </form>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รหัส</th>
              <th className="px-4 py-2 font-medium">ชื่อ</th>
              <th className="px-4 py-2 font-medium">จำนวนสินค้า</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {productTypes.map((pt) => (
              <tr key={pt.id} className="border-t">
                <td className="px-4 py-2 font-mono">{pt.code}</td>
                <td className="px-4 py-2">{pt.name}</td>
                <td className="px-4 py-2">{pt._count.products} SKU</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      pt.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {pt.active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <a href={`/product-types/${pt.id}`} className="text-xs text-blue-600 hover:underline">
                    แก้ไข
                  </a>
                  <form action={toggleProductTypeActive.bind(null, pt.id)} className="inline">
                    <button className="text-xs text-gray-500 hover:text-red-600">
                      {pt.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  required = false,
  type = "text",
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
