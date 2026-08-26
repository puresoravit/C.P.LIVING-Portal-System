import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProduct, updateProductCompanyAccess } from "../actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";
import { ProductCompanyAccessForm } from "@/components/product-company-access-form";

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [product, productTypes, categories, productModels, customers] = await Promise.all([
    db.product.findUnique({ where: { id: params.id }, include: { companyAccess: { select: { customerId: true } } } }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productModel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.customer.findMany({
      where: { active: true },
      select: { id: true, companyName: true, code: true },
      orderBy: { companyName: "asc" },
    }),
  ]);
  if (!product) notFound();

  const updateWithId = updateProduct.bind(null, product.id);
  // R8 — Product Assignment ตามบริษัทลูกค้า: กำหนดได้เฉพาะที่ Family Head (Standalone/
  // Anchor) — Variant (parentProductId/modelId ไม่ว่าง) ตามสิทธิ์ของหัวเสมอ ไม่มีของตัวเอง
  const isFamilyHead = !product.parentProductId && !product.modelId;
  const accessAction = updateProductCompanyAccess.bind(null, product.id);
  const modelsByType = productModels.map((m) => ({ id: m.id, name: m.name, productTypeId: m.productTypeId }));
  const modelsForCurrentType = productModels.filter((m) => m.productTypeId === product.productTypeId);
  // Owner UAT Fix Batch 1 — ข้อ 1: คำนวณป้ายราคาเริ่มต้นฝั่ง Server ตาม Category ปัจจุบัน
  // ของสินค้า (ต่างจากหน้า Create ที่ Category เริ่มต้นว่างเสมอ) — ต้องคำนวณให้ตรงกับที่
  // Client Script จะคำนวณตอน change ทุกประการ ไม่งั้น Text จะไม่ตรงกับที่ Hydrate ตอนโหลด
  // หน้าแรก (Hydration Mismatch) ถ้าสินค้านี้ผูก Category ที่ usesSize=true อยู่แล้ว
  const currentCategory = categories.find((c) => c.id === product.categoryId);
  const initialPriceLabel =
    currentCategory && currentCategory.usesSize ? "ราคาต่อฟุต (รวม VAT) *" : currentCategory ? "ราคาต่อหน่วย (รวม VAT) *" : "ราคาตั้งต้น (รวม VAT) *";
  const usesSize = !!(currentCategory && currentCategory.usesSize);
  // Owner UAT — ข้อ 1: เหมือนหน้า Create — ต้องคำนวณฝั่ง Server ให้ตรงกับสถานะปัจจุบันของ
  // สินค้านี้เป๊ะ (กัน Hydration Mismatch) — เตือนเฉพาะตอน usesSize=true และไม่ได้ผูก
  // รุ่นสินค้า (Legacy) และยังไม่ได้กรอกราคาต่อฟุตไว้เลยทั้งคู่
  const isSizedAnchor = usesSize && !product.modelId;
  const showInitialUsesSizeWarning = isSizedAnchor && product.pricePerFoot == null;
  const showPricePerFootField = usesSize;

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
        className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <Field label="รหัสสินค้า / Code *" name="sku" defaultValue={product.sku} required autoFocus />
        <div className="col-span-1 sm:col-span-2">
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
        {/* Owner UAT — ข้อ 1: Legacy/Advanced — ปกติไม่ต้องใช้อีกต่อไป */}
        <SelectField label="รุ่นสินค้า (Legacy — ปกติไม่ต้องใช้)" name="modelId" defaultValue={product.modelId ?? ""}>
          <option value="">— ไม่ผูก (ปกติ) —</option>
          {modelsForCurrentType.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectField>
        {/* Owner UAT — ข้อ 1: เตือนเฉพาะตอน usesSize=true และไม่ได้ผูกรุ่นสินค้า (Legacy)
            และไม่ได้กรอกราคาต่อฟุตไว้เลยทั้งคู่ — ค่าเริ่มต้นคำนวณจาก
            showInitialUsesSizeWarning ด้านบน ให้ตรงกับสถานะจริงของสินค้านี้ทันทีที่โหลด
            หน้า (กัน Hydration Mismatch เหมือนป้ายราคา) */}
        <div
          id="editUsesSizeWarning"
          className={`col-span-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 ${showInitialUsesSizeWarning ? "" : "hidden"}`}
        >
          ⚠️ ประเภทสินค้านี้ใช้ขนาด (Size) — กรุณากรอก &quot;ราคาต่อฟุต&quot; ด้านล่าง เพื่อให้เลือกขนาดได้ตอนออกเอกสาร
          มิฉะนั้นสินค้านี้จะไม่มีตัวเลือกขนาดให้เลือกเลย
        </div>
        <Field label="หน่วย *" name="unit" defaultValue={product.unit} required />
        {/* Owner UAT Fix Batch 1 — ข้อ 1: ป้ายราคาเริ่มต้นคำนวณจาก Category ปัจจุบันแล้ว
            (initialPriceLabel ด้านบน) — Script ด้านล่างจะอัปเดตต่อเฉพาะตอนมี change
            Event จริงจากผู้ใช้เท่านั้น ไม่เรียกซ้ำตอนโหลดหน้า (กัน Hydration Mismatch) —
            Owner UAT Fix Batch 3 — ข้อ 4: ซ่อน Field นี้ไปเลยตอนสินค้านี้เป็น Sized Anchor
            อยู่แล้ว (usesSize=true และไม่ได้ผูกรุ่นสินค้า) — isSizedAnchor คำนวณฝั่ง Server
            ให้ตรงกับสถานะปัจจุบันเป๊ะ กัน Hydration Mismatch เหมือน Field อื่นในหน้านี้ */}
        <div id="editStandardPriceWrap" className={isSizedAnchor ? "hidden" : ""}>
          <Field
            label={initialPriceLabel}
            name="standardPrice"
            type="number"
            defaultValue={String(product.standardPrice)}
            required={!isSizedAnchor}
          />
        </div>
        {/* Owner UAT — ข้อ 1: Product เป็น Size Family Anchor ของตัวเองได้ — แก้ไขราคาต่อ
            ฟุตตรงนี้จะ Recalculate Size Variant ที่มีอยู่แล้วทันที (เหมือนหน้ารุ่นสินค้า) —
            Owner UAT Fix Batch 3 — ข้อ 4: บังคับกรอก (required) เฉพาะตอนเป็น Source ราคา
            เดียวจริงๆ (isSizedAnchor) */}
        <div id="editPricePerFootWrap" className={`col-span-3 ${showPricePerFootField ? "" : "hidden"}`}>
          <Field
            label="ราคาต่อฟุต (รวม VAT) — กรอกเพื่อสร้าง/อัปเดต Size 3/3.5/4/5/6 ฟุต + ขนาดพิเศษ อัตโนมัติ"
            name="pricePerFoot"
            type="number"
            defaultValue={product.pricePerFoot != null ? String(product.pricePerFoot) : ""}
            required={isSizedAnchor}
          />
        </div>
        <div className="col-span-1 sm:col-span-3">
          <Field label="คำอธิบาย" name="description" defaultValue={product.description ?? ""} />
        </div>
        <div className="col-span-1 sm:col-span-3 flex gap-2">
          <SubmitButton>บันทึกการแก้ไข</SubmitButton>
          <a href="/products" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </ActionForm>

      {/* R8 — Product Assignment ตามบริษัทลูกค้า (เฉพาะ Family Head — Variant ตามหัวเสมอ) */}
      <div className="mt-4">
        {isFamilyHead ? (
          <ProductCompanyAccessForm
            customers={customers}
            initialCustomerIds={product.companyAccess.map((a) => a.customerId)}
            action={accessAction}
          />
        ) : (
          <p className="text-xs text-gray-500 bg-gray-50 border rounded px-3 py-2">
            การกำหนดบริษัทลูกค้าของสินค้านี้ทำที่ตัวหลักของครอบครัวสินค้า (
            {product.parentProductId ? (
              <a href={`/products/${product.parentProductId}`} className="text-blue-600 hover:underline">
                สินค้าหลัก
              </a>
            ) : (
              <a href={`/product-models/${product.modelId}`} className="text-blue-600 hover:underline">
                รุ่นสินค้า
              </a>
            )}
            ) — Size Variant ทุกตัวใช้สิทธิ์เดียวกับตัวหลักเสมอ
          </p>
        )}
      </div>

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
              modelSelect.innerHTML = '<option value="">— ไม่ผูก (ปกติ) —</option>';
              modelsByType.filter(m => m.productTypeId === typeId).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                modelSelect.appendChild(opt);
              });
              updatePricePerFootUi();
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

            // Owner UAT — ข้อ 1: เหมือนหน้า Create — ไม่เรียกตอนโหลดหน้า
            // (showInitialUsesSizeWarning/showPricePerFootField ฝั่ง Server คำนวณให้ตรง
            // อยู่แล้ว)
            const usesSizeWarning = document.getElementById('editUsesSizeWarning');
            const pricePerFootWrap = document.getElementById('editPricePerFootWrap');
            const pricePerFootInput = document.querySelector('input[name="pricePerFoot"]');
            // Owner UAT Fix Batch 3 — ข้อ 4: เหมือนหน้า Create ทุกประการ
            const standardPriceWrap = document.getElementById('editStandardPriceWrap');
            const standardPriceInput = document.querySelector('input[name="standardPrice"]');
            function updatePricePerFootUi() {
              const cat = categoriesUsesSize.find(c => c.id === categorySelect.value);
              const usesSize = !!(cat && cat.usesSize);
              const hasModel = !!modelSelect.value;
              const isSizedAnchor = usesSize && !hasModel;

              pricePerFootWrap.classList.toggle('hidden', !usesSize);
              pricePerFootInput.disabled = hasModel;
              if (hasModel) pricePerFootInput.value = '';
              pricePerFootInput.required = isSizedAnchor;

              standardPriceWrap.classList.toggle('hidden', isSizedAnchor);
              standardPriceInput.required = !isSizedAnchor;
              standardPriceInput.disabled = isSizedAnchor;

              const showWarning = isSizedAnchor && !pricePerFootInput.value;
              usesSizeWarning.classList.toggle('hidden', !showWarning);
            }
            categorySelect.addEventListener('change', updatePricePerFootUi);
            modelSelect.addEventListener('change', updatePricePerFootUi);
            pricePerFootInput.addEventListener('input', updatePricePerFootUi);
          `,
        }}
      />
    </div>
  );
}
