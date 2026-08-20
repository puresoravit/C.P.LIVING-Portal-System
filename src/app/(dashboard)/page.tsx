import { getDashboard } from "@/lib/reports";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function startOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// ข้อ 3.2: Billing Staff ไม่มีสิทธิ์ "ดู Dashboard/ดู Report" ตาม Permission
// Matrix (มีแค่ OWNER_ADMIN และ VIEWER) — งั้นหน้าแรกของ Billing Staff
// ต้องเป็นทางลัดใช้งานประจำวันแทน ไม่ใช่ Dashboard ยอดขาย
export default async function HomePage({
  searchParams,
}: {
  searchParams: { dateFrom?: string; dateTo?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  if (!can(role, "report.view")) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-lg font-semibold mb-4">หน้าหลัก</h1>
        <div className="grid grid-cols-2 gap-3">
          <a href="/orders/new" className="bg-white border rounded-lg p-4 hover:bg-gray-50">
            <div className="font-medium text-sm mb-1">+ สร้างออเดอร์ใหม่</div>
            <div className="text-xs text-gray-500">คีย์รายการขาย แยกบิลอัตโนมัติตามประเภทสินค้า</div>
          </a>
          <a href="/orders" className="bg-white border rounded-lg p-4 hover:bg-gray-50">
            <div className="font-medium text-sm mb-1">ดูออเดอร์ทั้งหมด</div>
            <div className="text-xs text-gray-500">ค้นหา/ตรวจสอบออเดอร์ที่คีย์ไว้</div>
          </a>
          <a href="/invoices" className="bg-white border rounded-lg p-4 hover:bg-gray-50">
            <div className="font-medium text-sm mb-1">ใบส่งของ/บิล</div>
            <div className="text-xs text-gray-500">ค้นหา พิมพ์ หรือยกเลิก Invoice</div>
          </a>
          <a href="/tax-invoices/new" className="bg-white border rounded-lg p-4 hover:bg-gray-50">
            <div className="font-medium text-sm mb-1">+ สร้างใบกำกับภาษี</div>
            <div className="text-xs text-gray-500">เลือกรายการตามที่ลูกค้าแจ้งมา</div>
          </a>
        </div>
      </div>
    );
  }

  const dateFrom = searchParams.dateFrom || startOfMonth();
  const dateTo = searchParams.dateTo || endOfToday();

  const { summary, byType, topCustomers, topProducts } = await getDashboard({
    dateFrom: new Date(dateFrom),
    dateTo: new Date(dateTo),
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">แดชบอร์ด</h1>
        <form className="flex gap-2 items-center text-sm">
          <input name="dateFrom" type="date" defaultValue={dateFrom} className="border rounded px-2 py-1 text-sm" />
          <span className="text-gray-400">ถึง</span>
          <input name="dateTo" type="date" defaultValue={dateTo} className="border rounded px-2 py-1 text-sm" />
          <button className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1">ดู</button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">ยอดขาย (Gross)</div>
          <div className="text-2xl font-medium">{money(summary.gross)}</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">ยอดสุทธิ (Net)</div>
          <div className="text-2xl font-medium text-blue-700">{money(summary.net)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">จำนวนสินค้าที่ขาย</div>
          <div className="text-2xl font-medium">{summary.quantity.toLocaleString("th-TH")}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {byType.map((t) => (
          <div key={t.key} className="bg-white border rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">{t.label} Sales</div>
            <div className="text-lg font-medium">{money(t.metrics.net)}</div>
            <div className="text-xs text-gray-400">{t.metrics.quantity.toLocaleString("th-TH")} หน่วย</div>
          </div>
        ))}
        {byType.length === 0 && (
          <div className="col-span-3 bg-white border rounded-lg p-4 text-center text-gray-400 text-sm">
            ยังไม่มียอดขายในช่วงเวลานี้
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-medium text-sm mb-2">Top 5 ลูกค้า</h2>
          <ul className="text-sm space-y-1">
            {topCustomers.map((c, i) => (
              <li key={c.key} className="flex justify-between">
                <span>
                  {i + 1}. {c.label}
                </span>
                <span className="text-gray-500">{money(c.metrics.net)}</span>
              </li>
            ))}
            {topCustomers.length === 0 && <li className="text-gray-400">ไม่มีข้อมูล</li>}
          </ul>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-medium text-sm mb-2">Top 5 สินค้า</h2>
          <ul className="text-sm space-y-1">
            {topProducts.map((p, i) => (
              <li key={p.key} className="flex justify-between">
                <span>
                  {i + 1}. {p.label}
                </span>
                <span className="text-gray-500">{money(p.metrics.net)}</span>
              </li>
            ))}
            {topProducts.length === 0 && <li className="text-gray-400">ไม่มีข้อมูล</li>}
          </ul>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        ดูรายงานละเอียดเพิ่มเติมที่เมนู{" "}
        <a href="/reports" className="text-blue-600 hover:underline">
          รายงานยอดขาย
        </a>
      </p>
    </div>
  );
}
