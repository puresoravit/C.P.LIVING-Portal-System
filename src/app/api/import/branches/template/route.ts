import { buildTemplateBuffer, excelFileResponse } from "@/lib/excel-template";

export async function GET() {
  const buffer = buildTemplateBuffer(
    ["customerCode", "code", "name", "taxBranchCode", "address", "province", "postalCode", "phone", "contactPerson", "note"],
    {
      customerCode: "C001",
      code: "01",
      name: "สาขารังสิต",
      taxBranchCode: "00001",
      address: "123 ถ.ตัวอย่าง",
      province: "ปทุมธานี",
      postalCode: "12000",
      phone: "02-000-0000",
      contactPerson: "คุณตัวอย่าง",
      note: "",
    }
  );
  return excelFileResponse(buffer, "Branch_Import_Template.xlsx");
}
