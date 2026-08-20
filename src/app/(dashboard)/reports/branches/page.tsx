import { getBranchProductMix } from "@/lib/reports";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function BranchReportPage({
  searchParams,
}: {
  searchParams: { dateFrom?: string; dateTo?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "report.view")) redirect("/");

  const branches = await getBranchProductMix({
    dateFrom: searchParams.dateFrom ? new Date(searchParams.dateFrom) : undefined,
    dateTo: searchParams.dateTo ? new Date(searchParams.dateTo) : undefined,
  });

  return (
    <div className="max-w-5xl">
      <a href="/reports" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายงานยอดขาย
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">รายงานแยกตามสาขา (Product Mix)</h1>
      <p className="text-sm text-gray-500 mb-4">ดูสัดส่วนสินค้าแต่ละ Type ที่แต่ละสาขาซื้อ</p>

      <form className="bg-white border rounded-lg p-4 grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่เริ่ม</label>
          <input name="dateFrom" type="date" defaultValue={searchParams.dateFrom} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่สิ้นสุด</label>
          <input name="dateTo" type="date" defaultValue={searchParams.dateTo} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="flex items-end">
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">ค้นหา</button>
        </div>
      </form>

      <div className="space-y-3">
        {branches.map((b) => (
          <div key={b.branchId} className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="font-medium text-sm">{b.branchName}</div>
              <div className="text-sm text-gray-500">รวม {money(b.total.net)} บาท</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {b.byType.map((t) => (
                <div key={t.code} className="bg-gray-50 rounded px-3 py-2 text-xs">
                  <div className="font-medium mb-1">TYPE {t.code}</div>
                  <div>จำนวน: {t.metrics.quantity.toLocaleString("th-TH")}</div>
                  <div>Net: {money(t.metrics.net)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {branches.length === 0 && (
          <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">ไม่พบข้อมูล</div>
        )}
      </div>
    </div>
  );
}
