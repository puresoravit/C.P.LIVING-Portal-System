import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildTemplateBuffer, excelFileResponse } from "@/lib/excel-template";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "price.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
