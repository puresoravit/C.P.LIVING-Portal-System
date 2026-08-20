import { ImportFlow } from "@/components/import-flow";
import { validateBranchImport, commitBranchImport } from "./actions";

export default function ImportBranchesPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">นำเข้าข้อมูลสาขา</h1>
      <p className="text-sm text-gray-500 mb-4">
        คอลัมน์ที่ต้องมี: customerCode (รหัสลูกค้าที่มีอยู่แล้วในระบบ), code, name (บังคับ) · taxBranchCode, address,
        province, postalCode, phone, contactPerson, note (ไม่บังคับ)
      </p>
      <ImportFlow
        templateUrl="/api/import/branches/template"
        validateAction={validateBranchImport}
        commitAction={commitBranchImport}
        previewColumns={["customerCode", "code", "name", "province"]}
      />
    </div>
  );
}
