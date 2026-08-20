import { ImportFlow } from "@/components/import-flow";
import { validateProductImport, commitProductImport } from "./actions";

export default function ImportProductsPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">นำเข้าข้อมูลสินค้า</h1>
      <p className="text-sm text-gray-500 mb-4">
        คอลัมน์ที่ต้องมี: sku, name, productTypeCode (ต้องเป็นรหัสประเภทที่มีอยู่แล้ว เช่น A/B/C), unit,
        standardPrice (บังคับ) · size, description (ไม่บังคับ)
      </p>
      <ImportFlow
        templateUrl="/api/import/products/template"
        validateAction={validateProductImport}
        commitAction={commitProductImport}
        previewColumns={["sku", "name", "productTypeCode", "standardPrice"]}
      />
    </div>
  );
}
