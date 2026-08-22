import { NextRequest, NextResponse } from "next/server";
import { rowsToXlsxBuffer, excelFileResponse } from "@/lib/excel-template";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSalesByGroup, type GroupKey } from "@/lib/reports";

const GROUP_LABEL: Record<GroupKey, string> = {
  month: "เดือน",
  customer: "ลูกค้า",
  branch: "สาขา",
  productType: "กลุ่มส่วนลด",
  sku: "สินค้า",
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !can((session.user as any).role, "report.export")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const groupBy = (searchParams.get("groupBy") as GroupKey) || "month";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const customerId = searchParams.get("customerId") || undefined;
  const branchId = searchParams.get("branchId") || undefined;
  const productTypeCode = searchParams.get("productTypeCode") || undefined;

  const groups = await getSalesByGroup(
    { dateFrom: dateFrom ? new Date(dateFrom) : undefined, dateTo: dateTo ? new Date(dateTo) : undefined, customerId, branchId, productTypeCode },
    groupBy
  );

  const rows = groups.map((g) => ({
    [GROUP_LABEL[groupBy]]: g.label,
    Quantity: g.metrics.quantity,
    Gross: g.metrics.gross,
    Discount: g.metrics.discount,
    Net: g.metrics.net,
    VAT: g.metrics.vat,
    Total: g.metrics.total,
  }));

  const buffer = await rowsToXlsxBuffer(rows, "Summary");
  return excelFileResponse(buffer, "sales_summary.xlsx");
}
