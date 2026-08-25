import { db } from "@/lib/db";
import { createProductType, toggleProductTypeActive } from "./actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field } from "@/components/form/fields";

export default async function ProductTypesPage() {
  const productTypes = await db.productType.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">กลุ่มส่วนลด</h1>
      <p className="text-sm text-gray-500 mb-4">
        ระบบใช้กลุ่มส่วนลดเหล่านี้แยกบิลอัตโนมัติตอน Confirm Order — กำหนด % ส่วนลดของกลุ่ม
        ได้ตรงนี้เลย มีผลกับทุกลูกค้าที่ซื้อสินค้าในกลุ่มนั้น (ถ้ามี Rule ส่วนลดรายลูกค้า/สาขา
        อยู่เดิม Rule จะสำคัญกว่าและถูกใช้แทน % ของกลุ่ม)
      </p>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ เพิ่มกลุ่มส่วนลดใหม่</summary>
        <ActionForm action={createProductType} successMessage="เพิ่มกลุ่มส่วนลดสำเร็จ" resetOnSuccess className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="รหัสกลุ่ม * (เช่น D)" name="code" required />
          <Field label="ชื่อกลุ่ม * (เช่น TYPE D)" name="name" required />
          <div className="col-span-1 sm:col-span-2">
            <Field label="คำอธิบาย" name="description" />
          </div>
          <Field label="% ส่วนลดของกลุ่ม (เว้นว่าง = ไม่มี)" name="defaultDiscountPct" type="number" step="0.01" min="0" max="100" />
          <Field label="ลำดับการแสดงผล" name="sortOrder" type="number" />
          <div className="col-span-1 sm:col-span-2">
            <SubmitButton>บันทึกประเภทสินค้า</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">รหัส</th>
              <th className="px-4 py-2 font-medium">ชื่อ</th>
              <th className="px-4 py-2 font-medium">% ส่วนลดกลุ่ม</th>
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
                <td className="px-4 py-2">
                  {pt.defaultDiscountPct != null ? `${Number(pt.defaultDiscountPct).toLocaleString("th-TH")}%` : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2">{pt._count.products} รหัสสินค้า</td>
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
    </div>
  );
}
