import {
  getDashboard,
  getSalesByGroup,
  fillYearMonths,
  getAvailableSalesYears,
  getPreviousDecemberNet,
  computeSalesGrowth,
} from "@/lib/reports";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CustomerHoverCard } from "@/components/customer-hover-card";
import { MonthlySalesChart } from "@/components/monthly-sales-chart";
import { SalesGrowthChart } from "@/components/sales-growth-chart";
import { startOfMonth, endOfCurrentMonth, safeDateParam } from "@/lib/date-utils";

const BUDDHIST_YEAR_OFFSET = 543;

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ข้อ 3.2: Billing Staff ไม่มีสิทธิ์ "ดู Dashboard/ดู Report" ตาม Permission
// Matrix (มีแค่ OWNER_ADMIN และ VIEWER) — งั้นหน้าแรกของ Billing Staff
// ต้องเป็นทางลัดใช้งานประจำวันแทน ไม่ใช่ Dashboard ยอดขาย
export default async function HomePage(
  props: {
    searchParams: Promise<{ dateFrom?: string; dateTo?: string; year?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  if (!can(role, "report.view")) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-lg font-semibold mb-4">หน้าหลัก</h1>
        <div className="grid grid-cols-2 gap-3">
          <a href="/orders/new" className="bg-white border rounded-lg p-4 hover:bg-gray-50">
            <div className="font-medium text-sm mb-1">+ สร้างออเดอร์ใหม่</div>
            <div className="text-xs text-gray-500">คีย์รายการขาย แยกบิลอัตโนมัติตามกลุ่มส่วนลด</div>
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

  const dateFrom = safeDateParam(searchParams.dateFrom, startOfMonth());
  const dateTo = safeDateParam(searchParams.dateTo, endOfCurrentMonth());

  // Phase R1 — Monthly Sales Chart: ปี (ค.ศ.) ใช้กรองข้อมูลจริง, แสดงผลเป็น พ.ศ. ตาม
  // ตัวอย่างที่อนุมัติ ("ปี: [2569 ▼]") — Reuse getSalesByGroup(..., "month") เดิม ไม่มี
  // Query ใหม่ ไม่แตะ Sales SOT
  const currentGregorianYear = new Date().getFullYear();
  const selectedYear = Number(searchParams.year) || currentGregorianYear;
  const [{ summary, customerCards, topCustomers, topProducts }, availableYears, monthlyGroups, previousDecemberNet] = await Promise.all([
    getDashboard({ dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) }),
    getAvailableSalesYears(),
    getSalesByGroup(
      { dateFrom: new Date(selectedYear, 0, 1), dateTo: new Date(selectedYear, 11, 31) },
      "month"
    ),
    getPreviousDecemberNet(selectedYear),
  ]);
  const monthlyData = fillYearMonths(selectedYear, monthlyGroups);
  const salesGrowthData = computeSalesGrowth(monthlyData, previousDecemberNet);
  // กันกรณี selectedYear (มาจาก URL) อยู่นอก Range ที่คำนวณได้ (เช่น พิมพ์ URL เอง) —
  // Dropdown ต้องมี Option ของปีที่กำลังเลือกอยู่เสมอ
  const yearOptions = [...new Set([selectedYear, ...availableYears])].sort((a, b) => b - a);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">ข้อมูลทั่วไป / Dashboard</h1>
        <form className="flex gap-2 items-center text-sm">
          <input name="dateFrom" type="date" defaultValue={dateFrom} className="border rounded px-2 py-1 text-sm" />
          <span className="text-gray-400">ถึง</span>
          <input name="dateTo" type="date" defaultValue={dateTo} className="border rounded px-2 py-1 text-sm" />
          <button className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1">ดู</button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">ยอดขาย (จำนวนเงิน)</div>
          <div className="text-2xl font-medium">{money(summary.gross)} บาท</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">ยอดสุทธิ (Net)</div>
          <div className="text-2xl font-medium text-blue-700">{money(summary.net)} บาท</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">จำนวนสินค้าที่ขาย</div>
          <div className="text-2xl font-medium">{summary.quantity.toLocaleString("th-TH")}</div>
        </div>
      </div>

      {/* R6 Phase D — ข้อ G: ระดับแรกของ Dashboard เปลี่ยนจาก Card กลุ่มส่วนลด → Card
          ลูกค้า แสดงเฉพาะลูกค้าที่มียอดตาม Sales SOT (Invoice ที่ผ่าน PRINTED Checkpoint)
          ในช่วงวันที่เลือก กดเข้าไปดู Breakdown ตามกลุ่มส่วนลดของลูกค้ารายนั้นได้ (ข้อ H) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        {customerCards.map((c) => (
          <a
            key={c.key}
            href={`/customers/sales/${c.key}?dateFrom=${dateFrom}&dateTo=${dateTo}`}
            className="bg-white border rounded-lg p-4 hover:bg-gray-50"
          >
            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
            <div className="text-lg font-medium">{money(c.metrics.net)}</div>
            <div className="text-xs text-gray-400">{c.metrics.quantity.toLocaleString("th-TH")} หน่วย</div>
          </a>
        ))}
        {customerCards.length === 0 && (
          <div className="col-span-full bg-white border rounded-lg p-4 text-center text-gray-400 text-sm">
            ยังไม่มียอดขายในช่วงวันที่นี้
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-medium text-sm mb-2">Top 10 ลูกค้า</h2>
          <ul className="text-sm space-y-1">
            {topCustomers.map((c, i) => (
              <CustomerHoverCard
                key={c.key}
                label={c.label}
                dateRangeLabel={`${toDisplayDate(dateFrom)} – ${toDisplayDate(dateTo)}`}
                metrics={{
                  gross: c.metrics.gross,
                  discount: c.metrics.discount,
                  net: c.metrics.net,
                  quantity: c.metrics.quantity,
                }}
              >
                <span>
                  {i + 1}. {c.label}
                </span>
                <span className="text-gray-500">{money(c.metrics.net)}</span>
              </CustomerHoverCard>
            ))}
            {topCustomers.length === 0 && <li className="text-gray-400">ไม่มีข้อมูล</li>}
          </ul>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-medium text-sm mb-2">Top 10 สินค้า</h2>
          <ul className="text-sm space-y-1">
            {topProducts.map((p, i) => (
              <li key={p.key} className="flex justify-between">
                <span>
                  {i + 1}.{" "}
                  {p.kind !== "standalone" ? (
                    // Owner UAT Fix — key มี ":" คั่น prefix ("model:{id}"/"family:{id}")
                    // ต้อง encodeURIComponent ก่อนใส่ใน Path เสมอ — เดิมใส่ดิบๆ แล้ว ":"
                    // ถูก Encode เป็น %3A ระหว่างทาง ทำให้ params.id ฝั่งหน้า Drill-down
                    // หา ":" ไม่เจอ ตีความเป็น Legacy modelId ทั้งก้อน → 404
                    <a
                      href={`/products/model/${encodeURIComponent(p.key)}?dateFrom=${dateFrom}&dateTo=${dateTo}`}
                      className="text-blue-600 hover:underline"
                    >
                      {p.label}
                    </a>
                  ) : (
                    p.label
                  )}
                </span>
                <span className="text-gray-500">{money(p.metrics.net)}</span>
              </li>
            ))}
            {topProducts.length === 0 && <li className="text-gray-400">ไม่มีข้อมูล</li>}
          </ul>
        </div>
      </div>

      {/* Dashboard Chart Redesign — ย้ายมาล่างสุดของหน้า, Desktop วางคู่ 50/50,
          Mobile Stack 1 Column — ปีเดียวกันคุมทั้ง 2 กราฟ (Query/Year Selector เดิม
          จาก R1 ตัวเดียว ไม่ซ้ำปุ่ม) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-sm">ยอดขายรายเดือน (ยอดสุทธิ)</h2>
            <form className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">ปี:</span>
              <select name="year" defaultValue={selectedYear} className="border rounded px-2 py-1 text-sm">
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y + BUDDHIST_YEAR_OFFSET}
                  </option>
                ))}
              </select>
              <button className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1">ดู</button>
            </form>
          </div>
          <MonthlySalesChart data={monthlyData} />
        </div>
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-medium text-sm mb-3">การเติบโตของยอดขาย (เทียบเดือนก่อนหน้า)</h2>
          <SalesGrowthChart data={salesGrowthData} />
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
