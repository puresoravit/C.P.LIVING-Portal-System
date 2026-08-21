import { db } from "@/lib/db";
import { createProduct, toggleProductActive } from "./actions";
import { bulkAssignProductModel } from "../product-models/actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { SizeSelect } from "@/components/size-select";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";

export default async function ProductsPage(props: { searchParams: Promise<{ q?: string; unassigned?: string }> }) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim();
  const unassignedOnly = searchParams.unassigned === "1";

  const [products, productTypes, productModels] = await Promise.all([
    db.product.findMany({
      where: {
        ...(q
          ? { OR: [{ sku: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] }
          : {}),
        ...(unassignedOnly ? { modelId: null } : {}),
      },
      include: { productType: true, model: true },
      orderBy: { createdAt: "desc" },
    }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productModel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const unassignedCount = await db.product.count({ where: { modelId: null } });

  // ข้อมูลสำหรับ Model dropdown ที่กรองตาม Type ที่เลือก (Pattern เดียวกับ
  // Customer→Branch dependent select ที่ใช้อยู่แล้วในระบบ) — ไม่ auto-derive ชื่อ
  // Model จากอะไรทั้งสิ้น เป็นแค่ filter รายการที่มีอยู่แล้วให้เลือกง่ายขึ้น
  const modelsByType = productModels.map((m) => ({ id: m.id, name: m.name, productTypeId: m.productTypeId }));

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-4">สินค้า</h1>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ เพิ่มสินค้าใหม่</summary>
        <ActionForm id="createProductForm" action={createProduct} successMessage="เพิ่มสินค้าสำเร็จ" resetOnSuccess className="px-4 pb-4 grid grid-cols-3 gap-3">
          <Field label="รหัสสินค้า / Code (เว้นว่าง = ระบบสร้างให้อัตโนมัติ)" name="sku" />
          <div className="col-span-2">
            <Field label="ชื่อสินค้า *" name="name" required />
          </div>
          <SelectField label="ประเภทสินค้า" name="productTypeId" defaultValue="">
            <option value="">— ไม่ระบุประเภท —</option>
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="รุ่นสินค้า (เว้นว่าง = ยังไม่ระบุ)" name="modelId" defaultValue="">
            <option value="">— ยังไม่ระบุ —</option>
          </SelectField>
          <SizeSelect />
          <Field label="หน่วย * (เช่น หลัง, ใบ)" name="unit" required />
          <Field label="ราคาตั้งต้น (รวม VAT) *" name="standardPrice" type="number" required />
          <div className="col-span-3">
            <Field label="คำอธิบาย" name="description" />
          </div>
          <div className="col-span-3">
            <SubmitButton>บันทึกสินค้า</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <div className="flex items-center justify-between mb-3 gap-3">
        <form className="flex-1">
          <input
            name="q"
            defaultValue={q}
            placeholder="ค้นหาด้วยรหัสสินค้าหรือชื่อสินค้า..."
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>
        <a
          href={unassignedOnly ? "/products" : "/products?unassigned=1"}
          className={`text-xs whitespace-nowrap px-3 py-2 rounded border ${
            unassignedOnly ? "bg-amber-50 border-amber-300 text-amber-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {unassignedOnly ? "✓ " : ""}ยังไม่ระบุรุ่นสินค้า ({unassignedCount})
        </a>
      </div>

      {unassignedOnly && productModels.length > 0 && (
        <ActionForm
          id="bulkAssignForm"
          action={bulkAssignProductModel}
          successMessage="กำหนดรุ่นสินค้าสำเร็จ"
          className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-center gap-2 text-sm"
        >
          <span className="text-gray-600 shrink-0">กำหนดรุ่นสินค้าให้รายการที่เลือกไว้ทั้งหมดเป็น:</span>
          <div className="flex-1">
            <SelectField label="" name="modelId" required defaultValue="">
              <option value="" disabled>
                เลือกรุ่นสินค้า
              </option>
              {productModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          </div>
          <SubmitButton className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded px-3 py-1.5">
            กำหนดรุ่น
          </SubmitButton>
        </ActionForm>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              {unassignedOnly && <th className="px-4 py-2 w-8"></th>}
              <th className="px-4 py-2 font-medium">รหัสสินค้า</th>
              <th className="px-4 py-2 font-medium">ชื่อสินค้า</th>
              <th className="px-4 py-2 font-medium">ประเภท</th>
              <th className="px-4 py-2 font-medium">รุ่นสินค้า</th>
              <th className="px-4 py-2 font-medium">หน่วย</th>
              <th className="px-4 py-2 font-medium text-right">ราคาตั้งต้น</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                {unassignedOnly && (
                  <td className="px-4 py-2">
                    <input type="checkbox" name="productId" value={p.id} form="bulkAssignForm" className="product-checkbox" />
                  </td>
                )}
                <td className="px-4 py-2 font-mono">{p.sku}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">
                  {p.productType ? p.productType.name : <span className="text-gray-400">ไม่ระบุประเภท</span>}
                </td>
                <td className="px-4 py-2">
                  {p.model ? p.model.name : <span className="text-gray-400">— ยังไม่ระบุ —</span>}
                </td>
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
                <td colSpan={unassignedOnly ? 9 : 8} className="px-4 py-8 text-center text-gray-400">
                  ไม่พบสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Type→Model dependent dropdown บนฟอร์มสร้างสินค้า — Pattern เดียวกับ
          Customer→Branch ที่ใช้อยู่แล้ว ไม่มี Business Logic ใดๆ แค่กรอง option */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const modelsByType = ${safeJsonForScript(modelsByType)};
            const productTypeSelect = document.querySelector('#createProductForm select[name="productTypeId"]');
            const modelSelect = document.querySelector('#createProductForm select[name="modelId"]');
            function updateModels() {
              const typeId = productTypeSelect.value;
              modelSelect.innerHTML = '<option value="">— ยังไม่ระบุ —</option>';
              modelsByType.filter(m => m.productTypeId === typeId).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                modelSelect.appendChild(opt);
              });
            }
            productTypeSelect.addEventListener('change', updateModels);
          `,
        }}
      />
    </div>
  );
}
