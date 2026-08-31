import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MasterSpecImportFlow } from "@/components/production/master-spec-import-flow";
import { validateMasterSpecImport, commitMasterSpecImport } from "./actions";

// Master Spec bulk import (2026-08-29) — Admin เท่านั้น (productionMasterSpec.manage)
// ไฟล์ Excel generate จาก scripts/generate-master-spec-xlsx.ts (Owner ไม่ต้องคีย์เอง)
export default async function MasterSpecImportPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "productionMasterSpec.manage")) redirect("/production/fabric");

  return (
    <div className="max-w-3xl">
      <a href="/production/fabric" className="text-sm text-blue-600 hover:underline">
        ← กลับไปสูตรผ้า / โครงสร้าง
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">นำเข้า Production Master Spec</h1>
      <p className="text-sm text-gray-500 mb-4">
        อัปโหลดไฟล์ Excel 3 ชีท (Specs / Fabrics / Layers) — ระบบตรวจทั้งชุดก่อน แล้ว import เป็น
        transaction เดียว all-or-nothing · รุ่นที่ยังไม่มีสินค้าในระบบจะถูกบันทึกเป็น
        &quot;ยังไม่ผูกสินค้า&quot; ผูกภายหลังได้ (ไม่มีการสร้างสินค้า/รุ่นใหม่จากการ import)
      </p>
      <MasterSpecImportFlow validateAction={validateMasterSpecImport} commitAction={commitMasterSpecImport} />
    </div>
  );
}
