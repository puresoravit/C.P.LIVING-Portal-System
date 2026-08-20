import { ImportFlow } from "@/components/import-flow";
import { validateCustomerImport, commitCustomerImport } from "./actions";

export default function ImportCustomersPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">นำเข้าข้อมูลลูกค้า</h1>
      <p className="text-sm text-gray-500 mb-4">
        คอลัมน์ที่ต้องมี: code, companyName (บังคับ) · taxId, phone, email, creditTerm (CASH/NET30/NET60/NET90), note (ไม่บังคับ)
      </p>
      <ImportFlow
        templateUrl="/api/import/customers/template"
        validateAction={validateCustomerImport}
        commitAction={commitCustomerImport}
        previewColumns={["code", "companyName", "taxId", "creditTerm"]}
      />
    </div>
  );
}
