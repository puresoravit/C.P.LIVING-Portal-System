import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildTemplateBuffer, excelFileResponse } from "@/lib/excel-template";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "discount.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
