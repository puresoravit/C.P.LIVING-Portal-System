import { db } from "@/lib/db";
import { createVatRate } from "./actions";

export default async function VatSettingsPage() {
  const vatRates = await db.vatRate.findMany({ orderBy: { effectiveFrom: "desc" } });

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-1">ตั้งค่า VAT</h1>
      <p className="text-sm text-gray-500 mb-4">
        อัตรา VAT ปัจจุบัน มีผลกับใบกำกับภาษีที่ออกตั้งแต่วันที่กำหนด — เมื่อตั้งอัตราใหม่
        ระบบจะปิดอัตราเดิมให้อัตโนมัติ (ไม่กระทบใบกำกับภาษีเก่าที่ออกไปแล้ว เพราะ Snapshot ไว้แล้ว)
      </p>

      <details className="mb-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-medium text-sm">+ ตั้งอัตรา VAT ใหม่</summary>
        <form action={createVatRate} className="px-4 pb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">อัตรา VAT (%) *</label>
            <input
              name="ratePct"
              type="number"
              step="0.01"
              defaultValue="7"
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
          <div className="col-span-2">
            <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
              บันทึกอัตรา VAT
            </button>
          </div>
        </form>
      </details>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">อัตรา</th>
              <th className="px-4 py-2 font-medium">มีผลตั้งแต่</th>
              <th className="px-4 py-2 font-medium">มีผลถึง</th>
            </tr>
          </thead>
          <tbody>
            {vatRates.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="px-4 py-2">{Number(v.ratePct)}%</td>
                <td className="px-4 py-2">{v.effectiveFrom.toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-2">
                  {v.effectiveTo ? (
                    v.effectiveTo.toLocaleDateString("th-TH")
                  ) : (
                    <span className="text-green-600 font-medium">ปัจจุบัน (ไม่มีกำหนด)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
