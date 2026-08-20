import { ImportFlow } from "@/components/import-flow";
import { validateDiscountImport, commitDiscountImport } from "./actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function ImportDiscountsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "discount.edit")) redirect("/");

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">นำเข้าข้อมูลส่วนลด</h1>
      <p className="text-sm text-gray-500 mb-4">
        คอลัมน์ที่ต้องมี: customerCode, productTypeCode, discountPct, effectiveFrom (บังคับ) · branchCode (เว้นว่าง =
        ทุกสาขา), effectiveTo (เว้นว่าง = ไม่มีวันหมดอายุ)
      </p>
      <ImportFlow
        templateUrl="/api/import/discounts/template"
        validateAction={validateDiscountImport}
        commitAction={commitDiscountImport}
        previewColumns={["customerCode", "branchCode", "productTypeCode", "discountPct"]}
      />
    </div>
  );
}
