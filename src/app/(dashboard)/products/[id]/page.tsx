import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProduct } from "../actions";

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [product, productTypes] = await Promise.all([
    db.product.findUnique({ where: { id: params.id } }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!product) notFound();

  const updateWithId = updateProduct.bind(null, product.id);

  return (
    <div className="max-w-2xl">
      <a href="/products" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการสินค้า
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขสินค้า: {product.name}</h1>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
        ⚠️ การเปลี่ยนราคาตั้งต้นตรงนี้จะมีผลกับ Order ใหม่ทันที — ถ้าต้องการ
        เปลี่ยนราคาแบบมีผลตั้งแต่วันที่กำหนด (Effective Date) ให้ใช้เมนู
        &quot;ราคา&quot; แทน (Phase 2 Price Rule)
      </p>

      <form action={updateWithId} className="bg-white border rounded-lg p-4 grid grid-cols-3 gap-3">
        <Field label="SKU *" name="sku" defaultValue={product.sku} required autoFocus />
        <div className="col-span-2">
          <Field label="ชื่อสินค้า *" name="name" defaultValue={product.name} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ประเภทสินค้า *</label>
          <select
            name="productTypeId"
            required
            defaultValue={product.productTypeId}
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>
        <Field label="ไซส์" name="size" defaultValue={product.size ?? ""} />
        <Field label="หน่วย *" name="unit" defaultValue={product.unit} required />
        <Field
          label="ราคาตั้งต้น (รวม VAT) *"
          name="standardPrice"
          type="number"
          defaultValue={String(product.standardPrice)}
          required
        />
        <div className="col-span-3">
          <Field label="คำอธิบาย" name="description" defaultValue={product.description ?? ""} />
        </div>
        <div className="col-span-3 flex gap-2">
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
            บันทึกการแก้ไข
          </button>
          <a href="/products" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  autoFocus = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        step={type === "number" ? "0.01" : undefined}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
