import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateProductAlias } from "../actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";

export default async function EditProductAliasPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [alias, productModels, standaloneProducts, customers, branches] = await Promise.all([
    db.productAlias.findUnique({ where: { id: params.id } }),
    db.productModel.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { active: true, modelId: null, parentProductId: null }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } }),
    db.branch.findMany({ where: { active: true }, include: { customer: true }, orderBy: { name: "asc" } }),
  ]);
  if (!alias) notFound();

  const updateWithId = updateProductAlias.bind(null, alias.id);

  return (
    <div className="max-w-xl">
      <a href="/production/product-aliases" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการชื่อเรียก
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">แก้ไขชื่อเรียก: {alias.aliasText}</h1>

      <ActionForm
        action={updateWithId}
        successMessage="บันทึกการแก้ไขสำเร็จ"
        className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <Field label="ชื่อเรียก *" name="aliasText" defaultValue={alias.aliasText} required autoFocus />
        <Field label="ภาษา (th/en, ไม่บังคับ)" name="lang" defaultValue={alias.lang ?? ""} />

        <SelectField label="ผูกกับรุ่นสินค้า (ProductModel)" name="productModelId" defaultValue={alias.productModelId ?? ""}>
          <option value="">-- ไม่เลือก --</option>
          {productModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectField>

        <SelectField label="หรือผูกกับสินค้าเดี่ยว (ไม่มีรุ่น)" name="productId" defaultValue={alias.productId ?? ""}>
          <option value="">-- ไม่เลือก --</option>
          {standaloneProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </option>
          ))}
        </SelectField>

        <SelectField label="ขอบเขต" name="scope" defaultValue={alias.scope}>
          <option value="GLOBAL">ทุกลูกค้า (Global)</option>
          <option value="CUSTOMER">เฉพาะลูกค้ารายนี้</option>
          <option value="BRANCH">เฉพาะสาขานี้</option>
        </SelectField>

        <div />

        <SelectField label="ลูกค้า" name="customerId" defaultValue={alias.customerId ?? ""}>
          <option value="">-- ไม่เลือก --</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
            </option>
          ))}
        </SelectField>
        <SelectField label="สาขา" name="branchId" defaultValue={alias.branchId ?? ""}>
          <option value="">-- ไม่เลือก --</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.customer.companyName} — {b.name}
            </option>
          ))}
        </SelectField>

        <div className="col-span-1 sm:col-span-2 flex gap-2">
          <SubmitButton>บันทึกการแก้ไข</SubmitButton>
          <a href="/production/product-aliases" className="text-sm text-gray-600 hover:text-gray-900 rounded px-4 py-2 border">
            ยกเลิก
          </a>
        </div>
      </ActionForm>
    </div>
  );
}
