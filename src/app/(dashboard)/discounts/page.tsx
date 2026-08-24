import { db } from "@/lib/db";
import { createDiscountRule, deleteDiscountRule } from "./actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField } from "@/components/form/fields";

export default async function DiscountsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "discount.view")) redirect("/");

  const [discountRules, customers, branches, productTypes] = await Promise.all([
    db.discountRule.findMany({
      include: { customer: true, branch: true, productType: true },
      orderBy: [{ customerId: "asc" }, { effectiveFrom: "desc" }],
    }),
    db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } }),
    db.branch.findMany({ where: { active: true }, include: { customer: true }, orderBy: { code: "asc" } }),
    db.productType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="max-w-6xl">
      <h1 className="text-lg font-semibold mb-1">ส่วนลด (Discount Rule)</h1>
      <p className="text-sm text-gray-500 mb-4">
        ตั้ง % ส่วนลดตามลูกค้า/สาขา × กลุ่มส่วนลด — คำนวณแยกจากราคาพิเศษ (Price
        Rule) เป็นคนละชั้น จะหักออกจากราคาตั้งต้นเสมอ ลำดับการใช้ส่วนลด:{" "}
        <b>สาขา+กลุ่มส่วนลด → ลูกค้า+กลุ่มส่วนลด → 0%</b>
      </p>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ ตั้งส่วนลดใหม่</summary>
        <ActionForm action={createDiscountRule} successMessage="บันทึกส่วนลดสำเร็จ" resetOnSuccess className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField label="ลูกค้า *" name="customerId" required defaultValue="">
            <option value="" disabled>
              เลือกลูกค้า
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName} ({c.code})
              </option>
            ))}
          </SelectField>
          <SelectField label="สาขา (เว้นว่าง = ใช้ทุกสาขาของลูกค้ารายนี้)" name="branchId" defaultValue="">
            <option value="">— ทุกสาขา —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.customer.companyName} / {b.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="กลุ่มส่วนลด *" name="productTypeId" required defaultValue="">
            <option value="" disabled>
              เลือกกลุ่มส่วนลด
            </option>
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </SelectField>
          <Field label="ส่วนลด (%) *" name="discountPct" type="number" min="0" max="100" required />
          <Field label="มีผลตั้งแต่ *" name="effectiveFrom" type="date" required />
          <Field label="มีผลถึง (เว้นว่าง = ไม่มีวันหมดอายุ)" name="effectiveTo" type="date" />
          <div className="col-span-1 sm:col-span-2">
            <SubmitButton>บันทึกส่วนลด</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">สาขา</th>
              <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
              <th className="px-4 py-2 font-medium text-right">ส่วนลด</th>
              <th className="px-4 py-2 font-medium">มีผลตั้งแต่</th>
              <th className="px-4 py-2 font-medium">มีผลถึง</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {discountRules.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{r.customer.companyName}</td>
                <td className="px-4 py-2">{r.branch ? r.branch.name : <span className="text-gray-400">ทุกสาขา</span>}</td>
                <td className="px-4 py-2">{r.productType.name}</td>
                <td className="px-4 py-2 text-right">{Number(r.discountPct)}%</td>
                <td className="px-4 py-2">{r.effectiveFrom.toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2">
                  {r.effectiveTo ? r.effectiveTo.toLocaleDateString("th-TH") : <span className="text-gray-400">ไม่มีกำหนด</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={deleteDiscountRule.bind(null, r.id)}>
                    <button className="text-xs text-gray-500 hover:text-red-600">ลบ</button>
                  </form>
                </td>
              </tr>
            ))}
            {discountRules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีส่วนลด — ระบบจะใช้ 0% เป็นค่าเริ่มต้น
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
