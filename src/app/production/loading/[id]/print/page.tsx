import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company-settings";
import { LoadingSheetControls } from "@/components/production/loading-sheet-controls";

// CP2 — ใบขึ้นของ A4 "แนวนอน": เอกสาร planned loading สำหรับพนักงานขีด tally หน้างาน
// เรียงตามลำดับจุดส่ง — การพิมพ์ไม่ mutate อะไรเลย (ไม่ตั้ง qtyLoaded/ไม่ reconcile/ไม่สร้าง
// ของค้าง — "พิมพ์" ≠ "ยืนยันขึ้นของ") — กันกระดาษเก่ากลายเป็น source of truth เงียบๆ ด้วย
// การพิมพ์ "เวอร์ชันแผน N + เวลาพิมพ์" บนหัวใบ: แผนแก้เมื่อไหร่ version ขยับ กระดาษเก่า
// เทียบกับหน้าจอแล้วรู้ทันทีว่าตกรุ่น
//
// @page CSS เขียนเฉพาะหน้านี้ ไม่เพิ่ม key ใน PRINT_PROFILES เด็ดขาด — profile ตัวนั้นถูก
// enumerate ใน dropdown ของ Billing (PrintProfileSelector/print-template-designer) เพิ่ม
// key = โผล่ในหน้า Billing ทันที (ห้ามแตะ Billing) — margin box ว่างใช้สูตรเดียวกับ
// printPageStyleFor ใน print-settings.ts

const EMPTY_MARGIN_BOXES =
  "@top-left { content: '' } @top-center { content: '' } @top-right { content: '' } " +
  "@bottom-left { content: '' } @bottom-center { content: '' } @bottom-right { content: '' }";
const LANDSCAPE_PAGE_STYLE = `@page { size: A4 landscape; margin: 6mm 8mm; ${EMPTY_MARGIN_BOXES} }`;

/** ตาราง tally 6×5 = 30 ช่องต่อรายการ ตาม requirement — ช่องใหญ่พอขีดปากกาหน้างาน */
function TallyGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 9mm)", gridAutoRows: "6.5mm" }}>
      {Array.from({ length: 30 }, (_, i) => (
        <div key={i} className="border border-gray-400" style={{ marginRight: "-1px", marginBottom: "-1px" }} />
      ))}
    </div>
  );
}

export default async function LoadingSheetPrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "loadingTrip.manage")) redirect("/");

  const [trip, company] = await Promise.all([
    db.loadingTrip.findUnique({
      where: { id: params.id },
      include: { drops: { orderBy: { seq: "asc" }, include: { lines: { orderBy: { id: "asc" } } } } },
    }),
    getCompanySettings(),
  ]);
  if (!trip) notFound();

  const customerIds = [...new Set(trip.drops.map((d) => d.customerId))];
  const branchIds = [...new Set(trip.drops.map((d) => d.branchId).filter((v): v is string => !!v))];
  const [customers, branches] = await Promise.all([
    customerIds.length ? db.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, companyName: true } }) : Promise.resolve([]),
    branchIds.length ? db.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const customerNameById = new Map(customers.map((c) => [c.id, c.companyName]));
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  const totalPlanned = trip.drops.reduce((s, d) => s + d.lines.reduce((x, l) => x + l.qtyPlanned, 0), 0);
  const statusText = trip.cancelledAt ? "ยกเลิกแล้ว" : trip.reconciledAt ? "กระทบยอดแล้ว" : trip.loadedAt ? "ขึ้นของแล้ว" : "วางแผน";

  // สินค้าเดียวหลายไซส์อ่านต่อเนื่อง: sort ตามชื่อ→ไซส์ แล้วแสดงชื่อครั้งเดียว (rowSpan)
  function groupedRows(lines: NonNullable<typeof trip>["drops"][number]["lines"]) {
    const sorted = [...lines].sort((a, b) => a.labelSnapshot.localeCompare(b.labelSnapshot, "th") || (a.size ?? "").localeCompare(b.size ?? "", "th"));
    const groups: { label: string; sku: string | null; rows: typeof sorted }[] = [];
    for (const line of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.label === line.labelSnapshot && last.sku === line.skuSnapshot) last.rows.push(line);
      else groups.push({ label: line.labelSnapshot, sku: line.skuSnapshot, rows: [line] });
    }
    return groups;
  }

  return (
    <div className="mx-auto" style={{ maxWidth: "281mm" }}>
      <style id="print-page-style" dangerouslySetInnerHTML={{ __html: `@media print { ${LANDSCAPE_PAGE_STYLE} }` }} />
      <LoadingSheetControls backHref={`/production/loading/${trip.id}`} />

      {trip.cancelledAt && (
        <div className="print:hidden bg-red-50 border border-red-200 text-red-800 text-sm rounded px-3 py-2 mb-2">
          ✕ เที่ยวนี้ถูกยกเลิกแล้ว — เอกสารนี้เป็นเพียงประวัติ ห้ามใช้ขึ้นของ
        </div>
      )}

      <div className="bg-white border print:border-0 rounded-lg print:rounded-none p-4 text-sm">
        {/* หัวใบ */}
        <div className="flex items-baseline justify-between border-b-2 border-gray-800 pb-1 mb-1">
          <div>
            <span className="font-semibold text-sm">{company.name}</span>
            <span className="text-[10px] text-gray-500 ml-2">ใบขึ้นของ — เอกสารภายใน (แผนการขึ้น · ขีดนับหน้างาน)</span>
          </div>
          <div className="text-right">
            <span className="font-semibold text-sm">{trip.tripNo}</span>
            {trip.cancelledAt && <span className="ml-2 text-xs font-semibold text-red-700">[ยกเลิกแล้ว]</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs border-b pb-1 mb-2">
          <span><span className="text-gray-500">ออกรถ:</span> <span className="font-medium">{trip.tripDate.toLocaleDateString("th-TH")}</span></span>
          {trip.vehicleNote && <span><span className="text-gray-500">รถ/คนขับ:</span> <span className="font-medium">{trip.vehicleNote}</span></span>}
          <span><span className="text-gray-500">จุดส่ง:</span> <span className="font-medium">{trip.drops.length}</span></span>
          <span><span className="text-gray-500">รวมตามแผน:</span> <span className="font-medium">{totalPlanned} ชิ้น</span></span>
          <span><span className="text-gray-500">สถานะ:</span> <span className="font-medium">{statusText}</span></span>
          {trip.note && <span><span className="text-gray-500">หมายเหตุ:</span> {trip.note}</span>}
          {/* กันกระดาษตกรุ่น: เทียบเวอร์ชันแผนบนกระดาษกับหน้าจอได้ทันที */}
          <span className="text-gray-500">พิมพ์ {new Date().toLocaleString("th-TH")} · แผนแก้ไขครั้งที่ {trip.version}</span>
        </div>

        {/* ต่อจุดส่ง */}
        <div className="space-y-3">
          {trip.drops.map((drop, idx) => (
            <div key={drop.id} className="print-keep-together">
              <div className="bg-gray-100 print:bg-gray-100 border border-gray-700 border-b-0 rounded-t px-2 py-0.5 flex items-center justify-between">
                <span className="font-semibold">
                  จุดที่ {idx + 1} — {customerNameById.get(drop.customerId) ?? "—"}
                  {drop.branchId && ` (${branchNameById.get(drop.branchId) ?? ""})`}
                  {drop.note && <span className="font-normal text-gray-600"> · {drop.note}</span>}
                </span>
                <span className="text-xs">รวมแผนจุดนี้ {drop.lines.reduce((s, l) => s + l.qtyPlanned, 0)} ชิ้น</span>
              </div>
              <table className="w-full border-collapse text-[13px]" style={{ border: "1px solid #374151" }}>
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-1.5 py-0.5 font-medium w-[34%]">สินค้า</th>
                    <th className="text-left px-1.5 py-0.5 font-medium w-[9%]">ไซส์</th>
                    <th className="text-right px-1.5 py-0.5 font-medium w-[7%]">แผน</th>
                    <th className="text-left px-1.5 py-0.5 font-medium">ช่องขีดนับ</th>
                    <th className="text-center px-1.5 py-0.5 font-medium w-[10%]">นับได้จริง</th>
                  </tr>
                </thead>
                <tbody>
                  {drop.lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-1.5 py-1 text-gray-400 text-xs">— ไม่มีรายการ —</td>
                    </tr>
                  )}
                  {groupedRows(drop.lines).flatMap((group) =>
                    group.rows.map((line, i) => (
                      <tr key={line.id} className="border-b border-gray-300" style={{ verticalAlign: "top" }}>
                        {i === 0 && (
                          <td rowSpan={group.rows.length} className="px-1.5 py-1 border-r border-gray-300">
                            <span className="font-medium">{group.label}</span>
                            {group.sku && <span className="block text-[10px] text-gray-500 font-mono">{group.sku}</span>}
                          </td>
                        )}
                        <td className="px-1.5 py-1 border-r border-gray-300">{line.size ?? "-"}</td>
                        <td className="px-1.5 py-1 text-right font-semibold border-r border-gray-300">{line.qtyPlanned}</td>
                        <td className="px-1.5 py-1 border-r border-gray-300">
                          <TallyGrid />
                          {line.note && <div className="text-[10px] text-gray-600 mt-0.5">หมายเหตุ: {line.note}</div>}
                        </td>
                        <td className="px-1.5 py-1" />
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* พื้นที่เขียนมือหน้างาน — กระดาษล้วน ไม่มีความหมายในระบบจนกว่าจะบันทึกตอนกระทบยอด */}
        <div className="mt-3 print-keep-together">
          <div className="bg-gray-100 print:bg-gray-100 border border-gray-700 border-b-0 rounded-t px-2 py-0.5 font-semibold">
            รายการเพิ่มหน้างาน (เขียนมือ — นำเข้าระบบตอนกระทบยอด)
          </div>
          <table className="w-full border-collapse text-[13px]" style={{ border: "1px solid #374151" }}>
            <tbody>
              {Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-b border-gray-300" style={{ verticalAlign: "top" }}>
                  <td className="px-1.5 py-1 border-r border-gray-300 w-[27%]" style={{ height: "12mm" }} />
                  <td className="px-1.5 py-1 border-r border-gray-300 w-[9%]" />
                  <td className="px-1.5 py-1 border-r border-gray-300 w-[7%]" />
                  <td className="px-1.5 py-1 border-r border-gray-300">
                    <TallyGrid />
                  </td>
                  <td className="px-1.5 py-1 w-[10%]" />
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-gray-500 mt-0.5">คอลัมน์: สินค้า / ไซส์ / จำนวน / ช่องขีดนับ / นับได้จริง — จุดส่งไหนระบุกำกับในช่องสินค้า</div>
        </div>
      </div>
    </div>
  );
}
