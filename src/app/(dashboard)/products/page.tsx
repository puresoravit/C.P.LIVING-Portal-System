import { db } from "@/lib/db";
import { createProduct, toggleProductActive } from "./actions";

export default async function ProductsPage(props: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim();

  const [products, productTypes] = await Promise.all([
    db.product.findMany({
      where: q
        ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
        : undefined,
      include: { productType: true },
      orderBy: { createdAt: "desc" },
    }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-4">สินค้า</h1>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ เพิ่มสินค้าใหม่</summary>
        <form action={createProduct} className="px-4 pb-4 grid grid-cols-3 gap-3">
          <Field label="SKU *" name="sku" required />
          <div className="col-span-2">
            <Field label="ชื่อสินค้า *" name="name" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ประเภทสินค้า *</label>
            <select name="productTypeId" required defaultValue="" className="w-full border rounded px-3 py-1.5 text-sm">
              <option value="" disabled>
                เลือกประเภท
              </option>
              {productTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
          </div>
          <Field label="ไซส์" name="size" />
          <Field label="หน่วย * (เช่น หลัง, ใบ)" name="unit" required />
          <Field label="ราคาตั้งต้น (รวม VAT) *" name="standardPrice" type="number" required />
          <div className="col-span-3">
            <Field label="คำอธิบาย" name="description" />
          </div>
          <div className="col-span-3">
            <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
              บันทึกสินค้า
            </button>
          </div>
        </form>
      </details>

      <form className="mb-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="ค้นหาด้วย SKU หรือชื่อสินค้า..."
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">ชื่อสินค้า</th>
              <th className="px-4 py-2 font-medium">ประเภท</th>
              <th className="px-4 py-2 font-medium">หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">ราคาตั้งต้น</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 font-mono">{p.sku}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.productType.name}</td>
                <td className="px-4 py-2">{p.unit}</td>
                <td className="px-4 py-2 text-right">
                  {Number(p.standardPrice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      p.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {p.active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <a href={`/products/${p.id}`} className="text-xs text-blue-600 hover:underline">
                    แก้ไข
                  </a>
                  <form action={toggleProductActive.bind(null, p.id)} className="inline">
                    <button className="text-xs text-gray-500 hover:text-red-600">
                      {p.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบสินค้า
                </td>
              </tr>
            )}
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
        step={type === "number" ? "0.01" : undefined}
        required={required}
        className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
