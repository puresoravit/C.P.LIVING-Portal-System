import { buildTemplateBuffer, excelFileResponse } from "@/lib/excel-template";

export async function GET() {
  const buffer = buildTemplateBuffer(
    ["code", "companyName", "taxId", "phone", "email", "creditTerm", "note"],
    {
      code: "C001",
      companyName: "บริษัท ตัวอย่าง จำกัด",
      taxId: "0123456789012",
      phone: "02-000-0000",
      email: "example@email.com",
      creditTerm: "CASH",
      note: "",
    }
  );
  return excelFileResponse(buffer, "Customer_Import_Template.xlsx");
}
