import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProductModel, batchCreateProductVariants, updateModelCompanyAccess, updateModelCatalog } from "../actions";
import { safeJsonForScript } from "@/lib/safe-json-script";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";
import { BatchSizeForm } from "@/components/batch-size-form";
import { ProductCompanyAccessForm } from "@/components/product-company-access-form";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function EditProductModelPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [model, productTypes, categories, variants, customers, catalogs] = await Promise.all([
    db.productModel.findUnique({
      where: { id: params.id },
      include: {
        companyAccess: { select: { customerId: true } },
        catalog: { select: { id: true, name: true, companies: { select: { customer: { select: { companyName: true } } } } } },
      },
    }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.productCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.product.findMany({ where: { modelId: params.id }, orderBy: { size: "asc" } }),
    db.customer.findMany({
      where: { active: true },
      select: { id: true, companyName: true, code: true },
      orderBy: { companyName: "asc" },
    }),
    db.productCatalog.findMany({
      where: { active: true },
      select: { id: true, name: true, companies: { select: { customer: { select: { companyName: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!model) notFound();

  const updateWithId = updateProductModel.bind(null, model.id);
  const batchSizeAction = batchCreateProductVariants.bind(null, model.id);
  const existingSizes = variants.map((v) => v.size ?? "");
  const commonUnit = variants[0]?.unit ?? "หลัง";

  return (
    <div className="max-w-xl">
      <a href="/product-models" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการรุ่นสินค้า
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขรุ่นสินค้า: {model.name}</h1>

      <ActionForm
        id="editProductModelForm"
        action={updateWithId}
        successMessage="บันทึกการแก้ไขสำเร็จ"
        className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <div className="col-span-1 sm:col-span-2">
          <SelectField label="กลุ่มส่วนลด *" name="productTypeId" required defaultValue={model.productTypeId}>
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="col-span-1 sm:col-span-2">
          <SelectField label="ประเภทสินค้า (ถ้ามี)" name="categoryId" defaultValue={model.categoryId ?? ""}>
            <option value="">— ไม่ระบุประเภทสินค้า —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="col-span-1 sm:col-span-2">
          <Field label="ชื่อรุ่นสินค้า *" name="name" defaultValue={model.name} required autoFocus />
        </div>
        <Field label="ลำดับการแสดงผล" name="sortOrder" type="number" defaultValue={String(model.sortOrder)} />
        <div className="col-span-1 sm:col-span-2 pricePerFootFields hidden bg-blue-50 border border-blue-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-1 sm:col-span-2 text-xs text-blue-800">
            ประเภทสินค้านี้มีขนาด (Size) — แก้ราคาต่อฟุตแล้วบันทึก ระบบจะสร้าง Standard Variant
            ที่ยังไม่มี และ<b>อัปเดตราคา Standard Variant ที่มีอยู่แล้วให้ตรงราคาต่อฟุตใหม่ทันที</b>{" "}
            (ไม่แตะ PriceRule เฉพาะลูกค้า/สาขา และไม่กระทบเอกสารที่ Confirm ไปแล้ว)
          </div>
          <Field label="ราคาต่อฟุต (บาท)" name="pricePerFoot" type="number" defaultValue={model.pricePerFoot != null ? String(model.pricePerFoot) : ""} />
          <Field label="หน่วยนับของ Variant (เช่น หลัง)" name="variantUnit" defaultValue={variants[0]?.unit ?? ""} />
        </div>
        <div className="col-span-1 sm:col-span-2 flex gap-2">
          <SubmitButton>บันทึกการแก้ไข</SubmitButton>
          <a href="/product-models" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </ActionForm>

      {/* R4 — Size Architecture Path A: จัดการ Size ของรุ่นนี้ทั้งหมดในหน้าเดียว —
          Owner/Staff มองเป็น "รุ่นเดียว + หลาย Size" ไม่ต้องสร้าง Product ทีละ SKU */}
      <div className="bg-white border rounded-lg p-4 mt-4">
        <h2 className="font-medium text-sm mb-3">ไซส์ของรุ่นนี้</h2>
        {variants.length > 0 && (
          <div className="border rounded-lg overflow-hidden mb-4">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัสสินค้า</th>
                  <th className="px-3 py-2 font-medium">ไซส์</th>
                  <th className="px-3 py-2 font-medium text-right">ราคา</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-3 py-2 font-mono">{v.sku}</td>
                    <td className="px-3 py-2">{v.size ?? "ไม่มีขนาด"}</td>
                    <td className="px-3 py-2 text-right">{money(v.standardPrice)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                          v.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {v.active ? "ใช้งาน" : "ปิดใช้งาน"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        <h3 className="font-medium text-xs text-gray-600 mb-2">เพิ่มไซส์ใหม่</h3>
        <BatchSizeForm modelId={model.id} existingSizes={existingSizes} defaultUnit={commonUnit} action={batchSizeAction} />
      </div>

      {/* R9 — Company Catalog ของรุ่นนี้ (Family Head — Variant ทุกไซส์ตามหัวเสมอ) */}
      <div className="mt-4 bg-white border rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-1">กลุ่มบริษัท (Catalog) ของรุ่นนี้</h2>
        <p className="text-xs text-gray-500 mb-3">
          {model.catalog
            ? `ปัจจุบันอยู่ในกลุ่ม "${model.catalog.name}" — บริษัทที่เห็น: ${model.catalog.companies.map((m) => m.customer.companyName).join(", ")}`
            : "ปัจจุบันเป็นสินค้าส่วนกลาง — ทุกบริษัทเห็นรุ่นนี้ตอนออกเอกสาร"}
        </p>
        <ActionForm action={updateModelCatalog.bind(null, model.id)} successMessage="บันทึกกลุ่มบริษัทสำเร็จ" className="flex items-end gap-2 max-w-md">
          <div className="flex-1">
            <SelectField label="ย้ายไปกลุ่ม" name="catalogId" defaultValue={model.catalogId ?? ""}>
              <option value="">— สินค้าส่วนกลาง (ทุกบริษัทเห็น) —</option>
              {catalogs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.companies.map((m) => m.customer.companyName).join(", ") || "ยังไม่มีบริษัท"})
                </option>
              ))}
            </SelectField>
          </div>
          <SubmitButton className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2">บันทึก</SubmitButton>
        </ActionForm>
      </div>

      {/* R8 — Allowlist รายบริษัทแบบเดิม: เหลือเป็นเครื่องมือขั้นสูงเฉพาะรุ่นที่เป็นสินค้า
          ส่วนกลาง (อยู่ใน Catalog แล้ว = สมาชิก Catalog ตัดสินอย่างเดียว ซ่อนกันสับสน) */}
      {!model.catalogId && (
        <div className="mt-4">
          <ProductCompanyAccessForm
            customers={customers}
            initialCustomerIds={model.companyAccess.map((a) => a.customerId)}
            action={updateModelCompanyAccess.bind(null, model.id)}
          />
        </div>
      )}

      {/* R6 Phase B — โชว์/ซ่อนช่องราคาต่อฟุตตาม Category ที่เลือก (usesSize) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const categoriesUsesSize = ${safeJsonForScript(Object.fromEntries(categories.map((c) => [c.id, c.usesSize])))};
            const categorySelect = document.querySelector('#editProductModelForm select[name="categoryId"]');
            const pricePerFootFields = document.querySelector('#editProductModelForm .pricePerFootFields');
            function updatePricePerFootVisibility() {
              const usesSize = categoriesUsesSize[categorySelect.value] === true;
              pricePerFootFields.classList.toggle('hidden', !usesSize);
            }
            categorySelect.addEventListener('change', updatePricePerFootVisibility);
            updatePricePerFootVisibility();
          `,
        }}
      />
    </div>
  );
}
