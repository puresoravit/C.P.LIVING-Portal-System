import {
  getDashboard,
  getSalesByGroup,
  fillYearMonths,
  getAvailableSalesYears,
  getPreviousDecemberNet,
  computeSalesGrowth,
  getTaxInvoiceSummary,
} from "@/lib/reports";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CustomerHoverCard } from "@/components/customer-hover-card";
import { MonthlySalesChart } from "@/components/monthly-sales-chart";
import { SalesGrowthChart } from "@/components/sales-growth-chart";
import { startOfMonth, endOfCurrentMonth, safeDateParam } from "@/lib/date-utils";
import { NavIcon } from "@/components/nav-icons";

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
  const [{ summary, customerCards, topCustomers, topProducts }, taxSummary, availableYears, monthlyGroups, previousDecemberNet] = await Promise.all([
    getDashboard({ dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) }),
    getTaxInvoiceSummary({ dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) }),
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
      {/* Owner UAT — Billing UI Visual Polish R2 (2026-08-24): พบระหว่างตรวจ 360px จริง
          (window.screen.width vs innerWidth ต่างกัน = Browser บังคับ Zoom-out ให้พอดี
          กับ Layout Viewport ที่กว้างเกิน) — Root Cause คือแถวนี้เป็น flex ธรรมดาไม่มี
          Wrap เลย (Pre-existing ตั้งแต่ก่อน R1/R2 ไม่เคยถูกจับได้เพราะการเช็ค Overflow
          รอบก่อนเทียบ scrollWidth กับ innerWidth ที่ถูกบังคับขยายไปด้วยกันทั้งคู่ ทำให้
          เท่ากันเสมอ ไม่เห็นปัญหา) — แก้เป็น Stack แนวตั้งบนจอแคบ + Filter Form Wrap ได้
          (Presentation/Layout ล้วนๆ ไม่แตะ Query Logic ใดๆ) ตรงตาม Requirement ข้อ 5
          "Header/Date controls ต้องไม่เกิด Horizontal Overflow" */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h1 className="text-lg font-semibold">ข้อมูลทั่วไป / Dashboard</h1>
        <form className="flex flex-wrap gap-2 items-center text-sm">
          <input name="dateFrom" type="date" defaultValue={dateFrom} className="border rounded px-2 py-1 text-sm" />
          <span className="text-gray-400">ถึง</span>
          <input name="dateTo" type="date" defaultValue={dateTo} className="border rounded px-2 py-1 text-sm" />
          <button className="bg-cp-navy hover:bg-cp-navy-light transition-colors duration-150 text-white rounded px-3 py-1">ดู</button>
        </form>
      </div>

      {/* Owner UAT — Billing UI Visual Polish R2: R1 (Pastel Tint เกือบขาว) "จางเกินไป"
          — เปลี่ยนเป็น Gradient อิ่มสีจริง (Tailwind 500→600, ไม่ใช่ Neon/Custom Hex) +
          ตัวอักษรขาวล้วน — Contrast ขาว-บนพื้นเข้ม > เข้ม-บนพื้นพาสเทล จึงอ่านง่ายขึ้นกว่า
          R1 ด้วยซ้ำ ไม่ใช่แลก Readability กับสี — Icon Chip แบบกระจกโปร่ง (bg-white/20)
          เดียวกับ Sidebar Main Menu Chip (Design Consistency ข้ามหน้า) + Icon ใหญ่จางๆ
          มุมล่างขวาเป็น Decorative ล้วนๆ (opacity 10%, ไม่ใช่ข้อมูล) — Palette: Blue/Sky
          (ยอดขาย) → Teal/Emerald (ยอดสุทธิ ตัวเลขหลักที่สุด) → Amber/Orange (จำนวนสินค้า)
          กลมกลืนกันในโทน Warm-to-Cool ที่ยังอ่านออกว่าเป็นชุดเดียวกัน — R2 Mobile Fix:
          grid-cols-3 (Fixed เดิม ตัวเลขตัดบรรทัดบนจอแคบ) → grid-cols-1 sm:grid-cols-3
          (Stack เต็มความกว้างต่ำกว่า 640px กันตัวเลขล้น ตรงตาม Requirement ข้อ 5) —
          Top10/Customer Card ด้านล่างได้ Accent สีเดียวกันเบาๆ (Icon Chip/แถบซ้าย) ไม่ไล่
          Gradient เต็มใบ กัน Dashboard รกเกินไปตามคำสั่ง */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="relative overflow-hidden bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl p-4 shadow-md shadow-blue-900/10 text-white">
          <NavIcon name="chart" className="absolute -right-3 -bottom-3 w-20 h-20 text-white opacity-10 pointer-events-none" />
          <div className="relative flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 shrink-0">
              <NavIcon name="chart" className="w-[18px] h-[18px]" />
            </span>
            <div className="text-xs text-white/80">ยอดขาย (จำนวนเงิน) — จากใบส่งของชั่วคราว</div>
          </div>
          <div className="relative text-2xl font-semibold">{money(summary.gross)} บาท</div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl p-4 shadow-md shadow-emerald-900/10 text-white">
          <NavIcon name="receipt" className="absolute -right-3 -bottom-3 w-20 h-20 text-white opacity-10 pointer-events-none" />
          <div className="relative flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 shrink-0">
              <NavIcon name="receipt" className="w-[18px] h-[18px]" />
            </span>
            <div className="text-xs text-white/80">ยอดสุทธิ (Net) — จากใบส่งของชั่วคราว</div>
          </div>
          <div className="relative text-2xl font-semibold">{money(summary.net)} บาท</div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-4 shadow-md shadow-orange-900/10 text-white">
          <NavIcon name="box" className="absolute -right-3 -bottom-3 w-20 h-20 text-white opacity-10 pointer-events-none" />
          <div className="relative flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 shrink-0">
              <NavIcon name="box" className="w-[18px] h-[18px]" />
            </span>
            <div className="text-xs text-white/80">จำนวนสินค้าที่ขาย</div>
          </div>
          <div className="relative text-2xl font-semibold">{summary.quantity.toLocaleString("th-TH")}</div>
        </div>
      </div>

      {/* R11 — ข้อ 1: ยอดฝั่งใบกำกับภาษี (PRINTED 9×11 เท่านั้น) แยกมุมมองจากฝั่งใบส่งของ
          เด็ดขาด ห้ามนำสองแถวมาบวกกัน (ใบกำกับโหมด AUTO ยอดซ้ำกับใบส่งของโดยธรรมชาติ) —
          แทนที่กลไก countAsSales เดิมทั้งหมด */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="relative overflow-hidden bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-4 shadow-md shadow-purple-900/10 text-white">
          <NavIcon name="receipt" className="absolute -right-3 -bottom-3 w-20 h-20 text-white opacity-10 pointer-events-none" />
          <div className="relative flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 shrink-0">
              <NavIcon name="receipt" className="w-[18px] h-[18px]" />
            </span>
            <div className="text-xs text-white/80">ยอดขาย (รวม VAT) — จากใบกำกับภาษี</div>
          </div>
          <div className="relative text-2xl font-semibold">{money(taxSummary.netAmount)} บาท</div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-fuchsia-500 to-pink-600 rounded-2xl p-4 shadow-md shadow-pink-900/10 text-white">
          <NavIcon name="receipt" className="absolute -right-3 -bottom-3 w-20 h-20 text-white opacity-10 pointer-events-none" />
          <div className="relative flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 shrink-0">
              <NavIcon name="receipt" className="w-[18px] h-[18px]" />
            </span>
            <div className="text-xs text-white/80">ยอดสุทธิ (ก่อน VAT) — จากใบกำกับภาษี</div>
          </div>
          <div className="relative text-2xl font-semibold">{money(taxSummary.valueAmount)} บาท</div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-500 to-slate-600 rounded-2xl p-4 shadow-md shadow-slate-900/10 text-white">
          <NavIcon name="list" className="absolute -right-3 -bottom-3 w-20 h-20 text-white opacity-10 pointer-events-none" />
          <div className="relative flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 shrink-0">
              <NavIcon name="list" className="w-[18px] h-[18px]" />
            </span>
            <div className="text-xs text-white/80">จำนวนใบกำกับภาษี (VAT {money(taxSummary.vatAmount)} บาท)</div>
          </div>
          <div className="relative text-2xl font-semibold">{taxSummary.count.toLocaleString("th-TH")}</div>
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
            className="bg-white border border-l-4 border-l-sky-400 rounded-lg p-4 hover:bg-gray-50 transition-colors duration-150"
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
          {/* Owner (2026-09-02) — หัวข้อกดเข้าไปดูอันดับเต็ม (11, 12, 13 ...) ได้ — คง
              Visual เดิมทุกอย่าง เพิ่มแค่ hover/chevron ให้รู้ว่ากดได้ + ส่งช่วงวันที่เดิมต่อ */}
          <h2 className="mb-2">
            <a
              href={`/dashboard/ranking?type=customer&dateFrom=${dateFrom}&dateTo=${dateTo}`}
              className="group flex items-center gap-1.5 font-medium text-sm hover:text-blue-600"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-sky-50 text-sky-600 shrink-0">
                <NavIcon name="users" className="w-3.5 h-3.5" />
              </span>
              Top 10 ลูกค้า
              <span className="text-gray-400 group-hover:text-blue-600 transition-transform duration-150 group-hover:translate-x-0.5">
                ›
              </span>
            </a>
          </h2>
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
          <h2 className="mb-2">
            <a
              href={`/dashboard/ranking?type=product&dateFrom=${dateFrom}&dateTo=${dateTo}`}
              className="group flex items-center gap-1.5 font-medium text-sm hover:text-blue-600"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-50 text-amber-600 shrink-0">
                <NavIcon name="box" className="w-3.5 h-3.5" />
              </span>
              Top 10 สินค้า
              <span className="text-gray-400 group-hover:text-blue-600 transition-transform duration-150 group-hover:translate-x-0.5">
                ›
              </span>
            </a>
          </h2>
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
