import { ImportFlow } from "@/components/import-flow";
import { validatePriceImport, commitPriceImport } from "./actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function ImportPricesPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "price.edit")) redirect("/");

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">นำเข้าข้อมูลราคา</h1>
      <p className="text-sm text-gray-500 mb-4">
        คอลัมน์ที่ต้องมี: sku (รหัสสินค้า / Code), customerCode, price, effectiveFrom (บังคับ) · branchCode (เว้นว่าง = ทุกสาขา),
        effectiveTo (เว้นว่าง = ไม่มีวันหมดอายุ) — ระบบจะเช็คช่วงวันที่ซ้อนกันให้อัตโนมัติ
      </p>
      <ImportFlow
        templateUrl="/api/import/prices/template"
        validateAction={validatePriceImport}
        commitAction={commitPriceImport}
        previewColumns={["sku", "customerCode", "branchCode", "price"]}
      />
    </div>
  );
}
