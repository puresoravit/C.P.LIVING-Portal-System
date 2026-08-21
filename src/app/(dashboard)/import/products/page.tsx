import { ImportFlow } from "@/components/import-flow";
import { validateProductImport, commitProductImport } from "./actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function ImportProductsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "product.edit")) redirect("/");

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">นำเข้าข้อมูลสินค้า</h1>
      <p className="text-sm text-gray-500 mb-4">
        คอลัมน์ที่ต้องมี: sku, name, productTypeCode (ต้องเป็นรหัสประเภทที่มีอยู่แล้ว เช่น A/B/C), unit,
        standardPrice (บังคับ) · size, modelName, description (ไม่บังคับ)
        <br />
        modelName: ถ้ากรอก จะสร้าง/ผูกรุ่นสินค้าให้อัตโนมัติ (สร้างใหม่เฉพาะกรณียังไม่มีรุ่นชื่อนี้ในประเภทสินค้านั้น)
        เว้นว่างได้ — Product จะไปอยู่ในรายการ &quot;ยังไม่ระบุรุ่นสินค้า&quot; ให้กำหนดทีหลังได้ที่หน้า สินค้า
      </p>
      <ImportFlow
        templateUrl="/api/import/products/template"
        validateAction={validateProductImport}
        commitAction={commitProductImport}
        previewColumns={["sku", "name", "productTypeCode", "modelName", "standardPrice"]}
      />
    </div>
  );
}
