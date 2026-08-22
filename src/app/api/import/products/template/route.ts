import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildTemplateBuffer, excelFileResponse } from "@/lib/excel-template";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "product.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const buffer = await buildTemplateBuffer(
    ["sku", "name", "productTypeCode", "productCategoryCode", "modelName", "size", "unit", "standardPrice", "description"],
    {
      sku: "M001",
      name: "ที่นอนสปริง GT-David ขนาด 5 ฟุต",
      productTypeCode: "A",
      productCategoryCode: "MATTRESS",
      modelName: "GT-David",
      size: "5 ฟุต",
      unit: "หลัง",
      standardPrice: 3900,
      description: "",
    }
  );
  return excelFileResponse(buffer, "Product_Import_Template.xlsx");
}
