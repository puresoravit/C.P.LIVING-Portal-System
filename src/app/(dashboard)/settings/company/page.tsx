import { getCompanySettings } from "@/lib/company-settings";
import { updateCompanySettings } from "./actions";

export default async function CompanySettingsPage() {
  const company = await getCompanySettings();

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">ข้อมูลบริษัท</h1>
      <p className="text-sm text-gray-500 mb-4">
        ใช้แสดงเป็นหัวกระดาษของทุกเอกสารที่พิมพ์ (ใบส่งของ, ใบกำกับภาษี ฯลฯ)
      </p>

      <form action={updateCompanySettings} className="bg-white border rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อบริษัท</label>
          <input name="name" defaultValue={company.name} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ที่อยู่</label>
          <textarea name="address" defaultValue={company.address} rows={2} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">เบอร์โทร</label>
          <input name="phone" defaultValue={company.phone} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">เลขประจำตัวผู้เสียภาษี</label>
          <input name="taxId" defaultValue={company.taxId} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
          บันทึก
        </button>
      </form>
    </div>
  );
}
