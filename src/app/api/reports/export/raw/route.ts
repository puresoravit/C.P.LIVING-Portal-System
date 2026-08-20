import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !can((session.user as any).role, "report.export")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const customerId = searchParams.get("customerId") || undefined;
  const branchId = searchParams.get("branchId") || undefined;
  const productTypeCode = searchParams.get("productTypeCode") || undefined;

  // ข้อ 46: Raw Data 1 row ต่อ Invoice Item พร้อม column ครบตามที่กำหนด
  const items = await db.invoiceItem.findMany({
    where: {
      invoice: {
        status: { not: "CANCELLED" },
        invoiceDate: { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined },
        customerId,
        branchId,
        productTypeCode,
      },
    },
    include: { invoice: { include: { customer: true, order: true } } },
    orderBy: { invoice: { invoiceDate: "asc" } },
  });

  const rows = items.map((item) => ({
    Date: item.invoice.invoiceDate.toISOString().slice(0, 10),
    "Order Number": item.invoice.order.orderNumber,
    "Invoice Number": item.invoice.invoiceNumber,
    "Customer Code": item.invoice.customer.code,
    "Customer Name": item.invoice.customerNameSnapshot,
    Branch: item.invoice.branchNameSnapshot,
    "Product Type": item.invoice.productTypeCode,
    SKU: item.skuSnapshot,
    "Product Name": item.productNameSnapshot,
    Quantity: Number(item.quantity),
    "Unit Price": Number(item.unitPriceSnapshot),
    Gross: Number(item.grossAmount),
    "Discount %": Number(item.invoice.discountPct),
    "Discount Amount": Number(item.discountAmount),
    Net: Number(item.netAmount),
    VAT: Number(item.vatAmount),
    "Grand Total": Number(item.totalAmount),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Raw Data");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="sales_raw_data.xlsx"',
    },
  });
}
