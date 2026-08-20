import { buildTemplateBuffer, excelFileResponse } from "@/lib/excel-template";

export async function GET() {
  const buffer = buildTemplateBuffer(
    ["sku", "name", "productTypeCode", "size", "unit", "standardPrice", "description"],
    {
      sku: "M001",
      name: "ที่นอนสปริง GT-David ขนาด 5 ฟุต",
      productTypeCode: "A",
      size: "5 ฟุต",
      unit: "หลัง",
      standardPrice: 3900,
      description: "",
    }
  );
  return excelFileResponse(buffer, "Product_Import_Template.xlsx");
}
