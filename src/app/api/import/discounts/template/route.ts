import { buildTemplateBuffer, excelFileResponse } from "@/lib/excel-template";

export async function GET() {
  const buffer = buildTemplateBuffer(
    ["customerCode", "branchCode", "productTypeCode", "discountPct", "effectiveFrom", "effectiveTo"],
    {
      customerCode: "C001",
      branchCode: "",
      productTypeCode: "A",
      discountPct: 10,
      effectiveFrom: "2026-01-01",
      effectiveTo: "",
    }
  );
  return excelFileResponse(buffer, "Discount_Import_Template.xlsx");
}
