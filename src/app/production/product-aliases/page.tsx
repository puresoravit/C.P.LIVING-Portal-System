import { db } from "@/lib/db";
import { createProductAlias, toggleProductAliasActive } from "./actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";
import { CancelButton } from "@/components/cancel-button";

function familyLabel(alias: {
  productModel: { name: string } | null;
  product: { name: string; sku: string } | null;
}): string {
  if (alias.productModel) return `รุ่น: ${alias.productModel.name}`;
  if (alias.product) return `สินค้า: ${alias.product.name} (${alias.product.sku})`;
  return "—";
}

function scopeLabel(alias: {
  scope: string;
  customer: { companyName: string } | null;
  branch: { name: string } | null;
}): string {
  if (alias.scope === "BRANCH") return `สาขา: ${alias.customer?.companyName ?? "?"} — ${alias.branch?.name ?? "?"}`;
  if (alias.scope === "CUSTOMER") return `ลูกค้า: ${alias.customer?.companyName ?? "?"}`;
  return "ทุกลูกค้า (Global)";
}

export default async function ProductAliasesPage() {
  const [aliases, productModels, standaloneProducts, customers, branches] = await Promise.all([
    db.productAlias.findMany({
      orderBy: { createdAt: "desc" },
      include: { productModel: true, product: true, customer: true, branch: true },
    }),
    db.productModel.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    // Family Head ที่เป็น Product เดี่ยว (ไม่มี ProductModel และไม่ใช่ Size Variant ของ
    // Anchor ตัวอื่น) — Filter เดียวกับที่ product-company-access.ts ใช้เลือก "หัว" ของสินค้า
    db.product.findMany({
      where: { active: true, modelId: null, parentProductId: null },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } }),
    db.branch.findMany({ where: { active: true }, include: { customer: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">ตระกูลสินค้า / ชื่อเรียก (Product Alias)</h1>
      <p className="text-sm text-gray-500 mb-4">
        บันทึกชื่อที่ลูกค้า/สาขาต่างๆ เรียกสินค้าจริง (เช่น &quot;เดวิท&quot; / &quot;David&quot;) ผูกกับตระกูลสินค้า
        (รุ่นสินค้า หรือ สินค้าเดี่ยวที่ไม่มีรุ่น) — ใช้เตรียมข้อมูลไว้ก่อนสำหรับ P5 (AI อ่านใบสั่งของ)
        ตอนนี้ยังเป็นแค่หน้าจัดการข้อมูลอ้างอิงเท่านั้น
      </p>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ เพิ่มชื่อเรียกใหม่</summary>
        <ActionForm
          action={createProductAlias}
          successMessage="เพิ่มชื่อเรียกสำเร็จ"
          resetOnSuccess
          className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <Field label="ชื่อเรียก * (เช่น เดวิท, David)" name="aliasText" required />
          <Field label="ภาษา (th/en, ไม่บังคับ)" name="lang" />

          <SelectField label="ผูกกับรุ่นสินค้า (ProductModel)" name="productModelId" defaultValue="">
            <option value="">-- ไม่เลือก --</option>
            {productModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>

          <SelectField label="หรือผูกกับสินค้าเดี่ยว (ไม่มีรุ่น)" name="productId" defaultValue="">
            <option value="">-- ไม่เลือก --</option>
            {standaloneProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </SelectField>

          <SelectField label="ขอบเขต" name="scope" defaultValue="GLOBAL">
            <option value="GLOBAL">ทุกลูกค้า (Global)</option>
            <option value="CUSTOMER">เฉพาะลูกค้ารายนี้</option>
            <option value="BRANCH">เฉพาะสาขานี้</option>
          </SelectField>

          <div className="col-span-1 sm:col-span-2 text-xs text-gray-500">
            หมายเหตุ: ขอบเขต &quot;เฉพาะลูกค้ารายนี้&quot; ต้องเลือกลูกค้าอย่างเดียว · &quot;เฉพาะสาขานี้&quot; ต้องเลือกทั้งลูกค้าและสาขา
            (ต้องเป็นสาขาของลูกค้ารายนั้นจริง) — ถ้าเลือกไม่ครบ/ไม่ตรงกัน ระบบจะแจ้งเตือนกลับมาให้แก้
          </div>
          <SelectField label="ลูกค้า" name="customerId" defaultValue="">
            <option value="">-- ไม่เลือก --</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </SelectField>
          <SelectField label="สาขา" name="branchId" defaultValue="">
            <option value="">-- ไม่เลือก --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.customer.companyName} — {b.name}
              </option>
            ))}
          </SelectField>

          <div className="col-span-1 sm:col-span-2">
            <SubmitButton>บันทึกชื่อเรียก</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">ชื่อเรียก</th>
                <th className="px-4 py-2 font-medium">ตระกูลสินค้า</th>
                <th className="px-4 py-2 font-medium">ขอบเขต</th>
                <th className="px-4 py-2 font-medium">สถานะ</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-2">{a.aliasText}</td>
                  <td className="px-4 py-2">{familyLabel(a)}</td>
                  <td className="px-4 py-2">{scopeLabel(a)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                        a.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {a.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <a href={`/production/product-aliases/${a.id}`} className="text-xs text-blue-600 hover:underline">
                      แก้ไข
                    </a>
                    <CancelButton
                      action={toggleProductAliasActive.bind(null, a.id)}
                      label={a.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      successMessage={a.active ? "ปิดใช้งานสำเร็จ" : "เปิดใช้งานสำเร็จ"}
                      className="text-xs text-gray-500 hover:text-red-600 border-0 p-0 inline"
                    />
                  </td>
                </tr>
              ))}
              {aliases.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    ยังไม่มีชื่อเรียกที่บันทึกไว้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
