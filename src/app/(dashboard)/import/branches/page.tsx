import { ImportFlow } from "@/components/import-flow";
import { validateBranchImport, commitBranchImport } from "./actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function ImportBranchesPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "branch.edit")) redirect("/");

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
