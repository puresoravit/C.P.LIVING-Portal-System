import { db } from "@/lib/db";
import { createPriceRule, deletePriceRule } from "./actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function PricesPage({
  searchParams,
}: {
  searchParams: { customerId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "price.view")) redirect("/");

  const [priceRules, products, customers, branches] = await Promise.all([
    db.priceRule.findMany({
      where: searchParams.customerId ? { customerId: searchParams.customerId } : undefined,
      include: { product: true, customer: true, branch: true },
      orderBy: [{ productId: "asc" }, { effectiveFrom: "desc" }],
    }),
    db.product.findMany({ where: { active: true }, orderBy: { sku: "asc" } }),
    db.customer.findMany({ where: { active: true }, orderBy: { companyName: "asc" } }),
    db.branch.findMany({ where: { active: true }, include: { customer: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="max-w-6xl">
      <h1 className="text-lg font-semibold mb-1">ราคา (Price Rule)</h1>
      <p className="text-sm text-gray-500 mb-4">
        ตั้งราคาพิเศษระดับลูกค้า หรือระดับสาขา — ถ้าไม่ตั้งไว้ที่นี่ ระบบจะใช้ราคาตั้งต้น
        (Standard Price) จากหน้า &quot;สินค้า&quot; แทนโดยอัตโนมัติ ลำดับการใช้ราคา:
        <b> สาขา → ลูกค้า → ราคาตั้งต้น</b>
      </p>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ ตั้งราคาพิเศษใหม่</summary>
        <form action={createPriceRule} className="px-4 pb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">สินค้า *</label>
            <select name="productId" required className="w-full border rounded px-3 py-1.5 text-sm">
              <option value="" disabled selected>
                เลือกสินค้า
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า *</label>
            <select name="customerId" required className="w-full border rounded px-3 py-1.5 text-sm">
              <option value="" disabled selected>
                เลือกลูกค้า
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              สาขา (เว้นว่าง = ใช้ทุกสาขาของลูกค้ารายนี้)
            </label>
            <select name="branchId" className="w-full border rounded px-3 py-1.5 text-sm">
              <option value="">— ทุกสาขา (Customer Price) —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.customer.companyName} / {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ราคา (รวม VAT) *</label>
            <input
              name="price"
              type="number"
              step="0.01"
              required
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">มีผลตั้งแต่ *</label>
            <input
              name="effectiveFrom"
              type="date"
              required
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">มีผลถึง (เว้นว่าง = ไม่มีวันหมดอายุ)</label>
            <input name="effectiveTo" type="date" className="w-full border rounded px-3 py-1.5 text-sm" />
          </div>
          <div className="col-span-2">
            <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
              บันทึกราคา
            </button>
          </div>
        </form>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">สินค้า</th>
              <th className="px-4 py-2 font-medium">ลูกค้า</th>
              <th className="px-4 py-2 font-medium">สาขา</th>
              <th className="px-4 py-2 font-medium text-right">ราคา</th>
              <th className="px-4 py-2 font-medium">มีผลตั้งแต่</th>
              <th className="px-4 py-2 font-medium">มีผลถึง</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {priceRules.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">
                  {r.product.sku} — {r.product.name}
                </td>
                <td className="px-4 py-2">
                  {r.customer ? (
                    r.customer.companyName
                  ) : (
                    <span className="text-gray-400">ทุกลูกค้า</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {r.branch ? (
                    r.branch.name
                  ) : (
                    <span className="text-gray-400">ทุกสาขา</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {Number(r.price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2">{r.effectiveFrom.toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2">
                  {r.effectiveTo ? r.effectiveTo.toLocaleDateString("th-TH") : <span className="text-gray-400">ไม่มีกำหนด</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={deletePriceRule.bind(null, r.id)}>
                    <button className="text-xs text-gray-500 hover:text-red-600">ลบ</button>
                  </form>
                </td>
              </tr>
            ))}
            {priceRules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีราคาพิเศษ — ระบบจะใช้ Standard Price ของสินค้าแทนทั้งหมด
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
