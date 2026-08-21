import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProduct } from "../actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { SizeSelect } from "@/components/size-select";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [product, productTypes, productModels] = await Promise.all([
    db.product.findUnique({ where: { id: params.id } }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productModel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!product) notFound();

  const updateWithId = updateProduct.bind(null, product.id);
  const modelsByType = productModels.map((m) => ({ id: m.id, name: m.name, productTypeId: m.productTypeId }));
  const modelsForCurrentType = productModels.filter((m) => m.productTypeId === product.productTypeId);

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

      <ActionForm
        action={updateWithId}
        successMessage="บันทึกการแก้ไขสำเร็จ"
        className="bg-white border rounded-lg p-4 grid grid-cols-3 gap-3"
      >
        <Field label="SKU *" name="sku" defaultValue={product.sku} required autoFocus />
        <div className="col-span-2">
          <Field label="ชื่อสินค้า *" name="name" defaultValue={product.name} required />
        </div>
        <SelectField label="ประเภทสินค้า *" name="productTypeId" required defaultValue={product.productTypeId}>
          {productTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {pt.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="รุ่นสินค้า (เว้นว่าง = ยังไม่ระบุ)" name="modelId" defaultValue={product.modelId ?? ""}>
          <option value="">— ยังไม่ระบุ —</option>
          {modelsForCurrentType.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectField>
        <SizeSelect defaultValue={product.size ?? ""} />
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
          <SubmitButton>บันทึกการแก้ไข</SubmitButton>
          <a href="/products" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </ActionForm>

      {/* Type→Model dependent dropdown — ถ้าเปลี่ยน Type ระหว่างแก้ไข ให้กรอง Model
          ใหม่ตาม Type ที่เลือก (Model เดิมของ Type เก่าจะไม่ตรงกันอีกต่อไป) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const modelsByType = ${safeJsonForScript(modelsByType)};
            const productTypeSelect = document.querySelector('select[name="productTypeId"]');
            const modelSelect = document.querySelector('select[name="modelId"]');
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
