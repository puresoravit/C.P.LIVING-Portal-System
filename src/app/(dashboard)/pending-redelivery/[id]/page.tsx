import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { BackLink } from "@/components/back-link";
import { ActionButton } from "@/components/action-button";
import { resolvePendingRedelivery } from "../actions";
import type { RedeliveryLine } from "@/lib/invoice-pending-redelivery";

function money(n: unknown) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function PendingRedeliveryDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "invoice.create")) redirect("/");

  const record = await db.invoicePendingRedelivery.findUnique({
    where: { id: params.id },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          customerNameSnapshot: true,
          addressSnapshot: true,
          parentOrderId: true,
          order: { select: { orderNumber: true } },
        },
      },
    },
  });
  if (!record) notFound();

  const lines = record.items as unknown as RedeliveryLine[];
  const resolveAction = resolvePendingRedelivery.bind(null, record.id);

  return (
    <div className="max-w-2xl">
      <BackLink href="/pending-redelivery">← กลับไปรายการค้างส่ง</BackLink>

      <h1 className="text-lg font-semibold mt-2 mb-1">ค้างส่ง — {record.invoice.customerNameSnapshot}</h1>
      <p className="text-sm text-gray-500 mb-4">
        จากใบส่งของ{" "}
        <a href={`/invoices/${record.invoice.id}`} className="text-blue-600 hover:underline font-mono">
          {record.invoice.invoiceNumber}
        </a>{" "}
        (Order{" "}
        <a href={`/orders/${record.invoice.parentOrderId}`} className="text-blue-600 hover:underline font-mono">
          {record.invoice.order.orderNumber}
        </a>
        ) · ออกใบเมื่อ {record.invoice.invoiceDate.toLocaleDateString("th-TH")}
        {record.invoice.addressSnapshot && ` · ${record.invoice.addressSnapshot}`}
      </p>

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">สินค้า</th>
                <th className="px-4 py-2 font-medium">ขนาด</th>
                <th className="px-4 py-2 font-medium text-right">จำนวนที่ค้างส่ง</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2">{line.productNameSnapshot}</td>
                  <td className="px-4 py-2">{line.sizeSnapshot ?? "-"}</td>
                  <td className="px-4 py-2 text-right">
                    {line.quantity} {line.unitSnapshot}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 mb-4 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">ยอดที่ลดลงจากใบส่งของ</span>
          <span className="font-medium">{money(record.reducedAmount)} บาท</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>บันทึกไว้เมื่อ</span>
          <span>
            {record.createdAt.toLocaleDateString("th-TH")}{" "}
            {record.createdAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {record.resolvedAt ? (
        <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-600">
          ✓ ปิดรายการแล้วเมื่อ {record.resolvedAt.toLocaleDateString("th-TH")}{" "}
          {record.resolvedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
        </div>
      ) : (
        <ActionButton
          action={resolveAction}
          label="✓ ยืนยันว่าส่งของค้างไปแล้ว"
          pendingLabel="กำลังบันทึก..."
          confirmMessage="ยืนยันว่าส่งของค้างชุดนี้ไปแล้ว? (แค่ปิดรายการติดตาม ไม่กระทบตัวเลขในเอกสารใดๆ)"
          successMessage="ปิดรายการค้างส่งเรียบร้อย"
          className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded px-4 py-2"
        />
      )}
    </div>
  );
}
