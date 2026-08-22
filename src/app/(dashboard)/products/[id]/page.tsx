import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProduct } from "../actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [product, productTypes, categories, productModels] = await Promise.all([
    db.product.findUnique({ where: { id: params.id } }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productModel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!product) notFound();

  const updateWithId = updateProduct.bind(null, product.id);
  const modelsByType = productModels.map((m) => ({ id: m.id, name: m.name, productTypeId: m.productTypeId }));
  const modelsForCurrentType = productModels.filter((m) => m.productTypeId === product.productTypeId);
  // Owner UAT Fix Batch 1 — ข้อ 1: คำนวณป้ายราคาเริ่มต้นฝั่ง Server ตาม Category ปัจจุบัน
  // ของสินค้า (ต่างจากหน้า Create ที่ Category เริ่มต้นว่างเสมอ) — ต้องคำนวณให้ตรงกับที่
  // Client Script จะคำนวณตอน change ทุกประการ ไม่งั้น Text จะไม่ตรงกับที่ Hydrate ตอนโหลด
  // หน้าแรก (Hydration Mismatch) ถ้าสินค้านี้ผูก Category ที่ usesSize=true อยู่แล้ว
  const currentCategory = categories.find((c) => c.id === product.categoryId);
  const initialPriceLabel =
    currentCategory && currentCategory.usesSize ? "ราคาต่อฟุต (รวม VAT) *" : currentCategory ? "ราคาต่อหน่วย (รวม VAT) *" : "ราคาตั้งต้น (รวม VAT) *";

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
        <Field label="รหัสสินค้า / Code *" name="sku" defaultValue={product.sku} required autoFocus />
        <div className="col-span-2">
          <Field label="ชื่อสินค้า *" name="name" defaultValue={product.name} required />
        </div>
        <SelectField label="กลุ่มส่วนลด (ถ้ามี)" name="productTypeId" defaultValue={product.productTypeId ?? ""}>
          <option value="">— ไม่ระบุกลุ่มส่วนลด —</option>
          {productTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {pt.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="ประเภทสินค้า (ถ้ามี)" name="categoryId" defaultValue={product.categoryId ?? ""}>
          <option value="">— ไม่ระบุประเภทสินค้า —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
        <Field label="หน่วย *" name="unit" defaultValue={product.unit} required />
        {/* Owner UAT Fix Batch 1 — ข้อ 1: ป้ายราคาเริ่มต้นคำนวณจาก Category ปัจจุบันแล้ว
            (initialPriceLabel ด้านบน) — Script ด้านล่างจะอัปเดตต่อเฉพาะตอนมี change
            Event จริงจากผู้ใช้เท่านั้น ไม่เรียกซ้ำตอนโหลดหน้า (กัน Hydration Mismatch) */}
        <Field
          label={initialPriceLabel}
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

            // Owner UAT Fix Batch 1 — ข้อ 1: สลับป้ายราคาตาม Category.usesSize — ไม่เรียก
            // updatePriceLabel() ตอนโหลดหน้า (initialPriceLabel ฝั่ง Server คำนวณให้ตรง
            // อยู่แล้ว) เพื่อกัน Hydration Mismatch เดียวกับหน้า Create
            const categoriesUsesSize = ${safeJsonForScript(categories.map((c) => ({ id: c.id, usesSize: c.usesSize })))};
            const categorySelect = document.querySelector('select[name="categoryId"]');
            const priceLabel = document.querySelector('label[for="standardPrice"]');
            function updatePriceLabel() {
              const cat = categoriesUsesSize.find(c => c.id === categorySelect.value);
              priceLabel.textContent = cat && cat.usesSize ? 'ราคาต่อฟุต (รวม VAT) *' : cat ? 'ราคาต่อหน่วย (รวม VAT) *' : 'ราคาตั้งต้น (รวม VAT) *';
            }
            categorySelect.addEventListener('change', updatePriceLabel);
          `,
        }}
      />
    </div>
  );
}
