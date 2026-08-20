import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { PrintButton } from "@/components/print-button";
import { printPageStyle } from "@/lib/print-settings";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function RepairNotePrintPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "repairNote.create")) redirect("/");

  const [note, company] = await Promise.all([
    db.repairReturnNote.findUnique({ where: { id: params.id }, include: { items: true, customer: true } }),
    getCompanySettings(),
  ]);
  if (!note) notFound();

  return (
    <div className="max-w-3xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: printPageStyle() }} />
      <PrintButton />

      <div className="bg-white border print:border-0 rounded-lg print:rounded-none p-8 text-sm">
        <div className="text-center mb-4">
          <div className="font-medium text-base">{company.name}</div>
          {company.address && <div className="text-xs text-gray-600">{company.address}</div>}
          {company.phone && <div className="text-xs text-gray-600">โทร {company.phone}</div>}
          <div className="font-medium mt-3">ใบส่งคืนสินค้าฝากซ่อม</div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-b py-3 mb-3">
          <div>
            <div>
              <span className="text-gray-500">ลูกค้า:</span> {note.customerNameSnapshot}
            </div>
            <div>
              <span className="text-gray-500">ที่อยู่:</span> {note.addressSnapshot ?? "-"}
            </div>
            {note.placeToDelivery && (
              <div>
                <span className="text-gray-500">สถานที่ส่งสินค้า:</span> {note.placeToDelivery}
              </div>
            )}
          </div>
          <div className="text-right">
            <div>
              <span className="text-gray-500">เลขที่:</span> {note.noteNumber}
            </div>
            <div>
              <span className="text-gray-500">วันที่:</span> {note.noteDate.toLocaleDateString("th-TH")}
            </div>
            <div>
              <span className="text-gray-500">รหัสลูกค้า:</span> {note.customer.code}
            </div>
            {note.reference && (
              <div>
                <span className="text-gray-500">อ้างถึง:</span> {note.reference}
              </div>
            )}
          </div>
        </div>

        <table className="w-full mb-3">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1">รายการ</th>
              <th className="text-right py-1">จำนวน</th>
            </tr>
          </thead>
          <tbody>
            {note.items.map((item) => (
              <tr key={item.id} className="border-b border-dashed">
                <td className="py-1">{item.description}</td>
                <td className="text-right py-1">
                  {Number(item.quantity)} {item.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {note.remark && <div className="text-xs text-gray-600 mb-6">หมายเหตุ: {note.remark}</div>}

        <div className="grid grid-cols-3 gap-4 text-center text-xs pt-8">
          <div>
            <div className="border-t border-gray-400 pt-1">ผู้รับสินค้า / Received By</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-1">ผู้ส่งสินค้า / Sent By</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-1">ผู้มีอำนาจอนุมัติ / Manager</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
        </div>
      </div>
    </div>
  );
}
