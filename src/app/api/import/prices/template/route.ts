import { buildTemplateBuffer, excelFileResponse } from "@/lib/excel-template";

export async function GET() {
  const buffer = buildTemplateBuffer(
    ["sku", "customerCode", "branchCode", "price", "effectiveFrom", "effectiveTo"],
    {
      sku: "M001",
      customerCode: "C001",
      branchCode: "",
      price: 3700,
      effectiveFrom: "2026-01-01",
      effectiveTo: "",
    }
  );
  return excelFileResponse(buffer, "Price_Import_Template.xlsx");
}
