import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company-settings";
import { LoadingSheetControls } from "@/components/production/loading-sheet-controls";
import { confirmSheetPrinted } from "../../actions";

// CP2/CP7 — ใบขึ้นของ A4 "แนวนอน": เอกสาร planned loading สำหรับพนักงานขีด tally หน้างาน
// เรียงตามลำดับจุดส่ง — การพิมพ์ไม่ mutate อะไรเลย (ไม่ตั้ง qtyLoaded/ไม่ reconcile/ไม่สร้าง
// ของค้าง — "พิมพ์" ≠ "ยืนยันขึ้นของ") — กันกระดาษเก่ากลายเป็น source of truth เงียบๆ ด้วย
// การพิมพ์ "เวอร์ชันแผน N + เวลาพิมพ์" บนหัวใบ: แผนแก้เมื่อไหร่ version ขยับ กระดาษเก่า
// เทียบกับหน้าจอแล้วรู้ทันทีว่าตกรุ่น
//
// CP7 (2026-08-30, Owner UAT) — สร้างใหม่ตามสเปกเดิม docs/production-module/01-สรุปรวม.md
// (ตกหล่นตอน CP2): คอลัมน์ ร้านค้า|รายการ|ไซส์|ค้างเดิม|ของใหม่|ขีดนับ|รวมขึ้น|คงค้าง เป็น
// ตารางต่อเนื่องเดียวทั้งใบ (ไม่แยกตารางต่อจุดส่งเหมือนเดิม) + 3 ตัวนับรีเซ็ตรายเดือน (เที่ยวที่/
// รอบรถคันนี้/รอบภาค) นับที่ "ออกจริง" (reconciledAt ไม่ null) เที่ยวที่ยกเลิกก่อนออกไม่กินเลข
// โดยธรรมชาติ (ไม่เคยมี reconciledAt) — ลำดับขึ้นรถ = สลับกับลำดับส่ง (โหลดจุดที่ส่งทีหลังก่อน)
//
// @page CSS เขียนเฉพาะหน้านี้ ไม่เพิ่ม key ใน PRINT_PROFILES เด็ดขาด — profile ตัวนั้นถูก
// enumerate ใน dropdown ของ Billing (PrintProfileSelector/print-template-designer) เพิ่ม
// key = โผล่ในหน้า Billing ทันที (ห้ามแตะ Billing) — margin box ว่างใช้สูตรเดียวกับ
// printPageStyleFor ใน print-settings.ts

const EMPTY_MARGIN_BOXES =
  "@top-left { content: '' } @top-center { content: '' } @top-right { content: '' } " +
  "@bottom-left { content: '' } @bottom-center { content: '' } @bottom-right { content: '' }";
const LANDSCAPE_PAGE_STYLE = `@page { size: A4 landscape; margin: 6mm 8mm; ${EMPTY_MARGIN_BOXES} }`;

/** 6 ช่องขีดกว้างต่อแถว — แต่ละช่องรับ "แต้ม" ขีดกลุ่มละ 5 ด้วยมือ (01-สรุปรวม.md: "6 ช่อง × 5 หลัง = 30 หลัง/แถว") ไม่ใช่ตารางย่อย 30 ช่องเล็ก */
function TallyBoxes() {
  return (
    <div className="flex" style={{ height: "9mm" }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="border-r border-gray-400 last:border-r-0 flex-1" />
      ))}
    </div>
  );
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
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

  // CP6 — confirm หลัง print dialog: บันทึกผู้พิมพ์/เวลา/เวอร์ชันแผน (พิมพ์ ≠ ส่งออก)
  const canConfirmPrint = !trip.cancelledAt && !trip.reconciledAt;
  const printedActor = trip.sheetPrintedById
    ? await db.user.findUnique({ where: { id: trip.sheetPrintedById }, select: { displayName: true, username: true } })
    : null;
  async function confirmPrint() {
    "use server";
    const formData = new FormData();
    formData.set("version", String(trip!.version));
    return confirmSheetPrinted(trip!.id, formData);
  }

  // CP7 — 3 ตัวนับรีเซ็ตรายเดือน นับที่ "ออกจริง" (reconciledAt) เท่านั้น — เที่ยวที่ยกเลิก/
  // ยังไม่ส่งออกไม่กินเลขไปแล้วโดยธรรมชาติ (ตัวเลขของเที่ยวนี้เองเป็นค่าประมาณจนกว่าจะส่งออกจริง)
  const monthLo = startOfMonth(trip.tripDate);
  const monthHi = endOfMonth(trip.tripDate);
  const reconciledThisMonthBefore = await db.loadingTrip.count({
    where: {
      reconciledAt: trip.reconciledAt ? { gte: monthLo, lt: trip.reconciledAt } : { gte: monthLo, lt: monthHi },
    },
  });
  const tripSeqThisMonth = reconciledThisMonthBefore + 1;

  let vehicleSeqThisMonth: number | null = null;
  if (trip.plateNumber) {
    const before = await db.loadingTrip.count({
      where: {
        plateNumber: trip.plateNumber,
        reconciledAt: trip.reconciledAt ? { gte: monthLo, lt: trip.reconciledAt } : { gte: monthLo, lt: monthHi },
      },
    });
    vehicleSeqThisMonth = before + 1;
  }

  const destinationLabels = [...new Set(trip.drops.map((d) => d.destinationLabel).filter((v): v is string => !!v))];
  const destinationSeqs = new Map<string, number>();
  for (const label of destinationLabels) {
    const before = await db.loadingDrop.count({
      where: {
        destinationLabel: label,
        trip: { reconciledAt: trip.reconciledAt ? { gte: monthLo, lt: trip.reconciledAt } : { gte: monthLo, lt: monthHi } },
      },
    });
    destinationSeqs.set(label, before + 1);
  }

  // จัดกลุ่มต่อจุดส่ง: รายการ (label+sku) → ไซส์ → แยกยอด ค้างเดิม(OUTSTANDING) / ของใหม่(FRESH+ADHOC)
  type SizeRow = { size: string | null; outstanding: number; fresh: number; note: string | null };
  type LabelGroup = { label: string; sku: string | null; rows: SizeRow[] };
  function groupDropLines(lines: NonNullable<typeof trip>["drops"][number]["lines"]): LabelGroup[] {
    const sorted = [...lines].sort((a, b) => a.labelSnapshot.localeCompare(b.labelSnapshot, "th") || (a.size ?? "").localeCompare(b.size ?? "", "th"));
    const groups: LabelGroup[] = [];
    for (const line of sorted) {
      let group = groups.find((g) => g.label === line.labelSnapshot && g.sku === line.skuSnapshot);
      if (!group) {
        group = { label: line.labelSnapshot, sku: line.skuSnapshot, rows: [] };
        groups.push(group);
      }
      let row = group.rows.find((r) => r.size === line.size);
      if (!row) {
        row = { size: line.size, outstanding: 0, fresh: 0, note: null };
        group.rows.push(row);
      }
      if (line.sourceType === "OUTSTANDING") row.outstanding += line.qtyPlanned;
      else row.fresh += line.qtyPlanned; // FRESH + ADHOC รวมเป็น "ของใหม่"
      if (line.note) row.note = row.note ? `${row.note}; ${line.note}` : line.note;
    }
    return groups;
  }

  const totalDrops = trip.drops.length;

  return (
    <div className="mx-auto" style={{ maxWidth: "281mm" }}>
      <style id="print-page-style" dangerouslySetInnerHTML={{ __html: `@media print { ${LANDSCAPE_PAGE_STYLE} }` }} />
      <LoadingSheetControls
        backHref={`/production/loading/${trip.id}`}
        canConfirm={canConfirmPrint}
        alreadyPrinted={!!trip.sheetPrintedAt}
        printedLabel={
          trip.sheetPrintedAt
            ? `${trip.sheetPrintedAt.toLocaleString("th-TH")}${printedActor ? ` โดย ${printedActor.displayName || printedActor.username}` : ""}`
            : undefined
        }
        planChangedAfterPrint={trip.sheetPrintedAt != null && trip.sheetPrintedVersion != null && trip.version > trip.sheetPrintedVersion}
        confirmAction={confirmPrint}
      />

      {trip.cancelledAt && (
        <div className="print:hidden bg-red-50 border border-red-200 text-red-800 text-sm rounded px-3 py-2 mb-2">
          ✕ รอบจัดส่งนี้ถูกยกเลิกแล้ว — เอกสารนี้เป็นเพียงประวัติ ห้ามใช้ขึ้นของ
        </div>
      )}

      <div className="bg-white border print:border-0 rounded-lg print:rounded-none p-4 text-sm">
        {/* หัวใบ — ตัดให้กระชับตามสเปก (Owner: เวอร์ชันก่อนหน้าเวิ่นเว้อเกินไป) เหลือ 2 แถว
            ข้อมูลจำเป็นจริง + มุมขวาบนพิมพ์เวลา/เวอร์ชันตัวเล็กกันกระดาษตกรุ่นเท่านั้น */}
        <div className="flex items-baseline justify-between border-b-2 border-gray-800 pb-1 mb-1">
          <span className="font-semibold text-sm">{company.name}</span>
          <div className="text-right text-[10px] text-gray-400">
            <span className="font-mono">{trip.tripNo}</span>
            {trip.cancelledAt && <span className="ml-2 font-semibold text-red-700">[ยกเลิกแล้ว]</span>}
            <span className="block">พิมพ์ {new Date().toLocaleString("th-TH")} · แก้ไขครั้งที่ {trip.version}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-xs border-b pb-1 mb-2">
          <span><span className="text-gray-500">วันที่:</span> <span className="font-medium">{trip.tripDate.toLocaleDateString("th-TH")}</span></span>
          <span><span className="text-gray-500">เที่ยวที่ (เดือนนี้):</span> <span className="font-medium">{tripSeqThisMonth}</span></span>
          <span>
            <span className="text-gray-500">ภาค:</span>{" "}
            <span className="font-medium">
              {destinationLabels.length === 0
                ? "—"
                : destinationLabels.map((l) => `${l} รอบที่ ${destinationSeqs.get(l)}`).join(", ")}
            </span>
          </span>
          <span><span className="text-gray-500">ทะเบียนรถ:</span> <span className="font-medium">{trip.plateNumber ?? "—"}</span></span>
          <span>
            <span className="text-gray-500">รถคันนี้ (เดือนนี้):</span>{" "}
            <span className="font-medium">{vehicleSeqThisMonth != null ? `รอบที่ ${vehicleSeqThisMonth}` : "—"}</span>
          </span>
          <span><span className="text-gray-500">คนขับ:</span> <span className="font-medium">{trip.driverName ?? "—"}</span></span>
          {trip.note && <span className="col-span-3"><span className="text-gray-500">หมายเหตุ:</span> {trip.note}</span>}
        </div>

        {/* ตารางต่อเนื่องเดียวทั้งใบ ตาม 01-สรุปรวม.md: ร้านค้า | รายการ | ไซส์ | ค้างเดิม | ของใหม่ | ขีดนับ | รวมขึ้น | คงค้าง
            สีเส้นเดียวกันทั้งตาราง (Owner: เวอร์ชันก่อนเส้นไม่ชนกัน) + collapse/spacing ระบุตรงๆ กัน sub-pixel gap ตอนพิมพ์ */}
        <table className="w-full border border-gray-400 text-[13px] print-keep-together" style={{ borderCollapse: "collapse", borderSpacing: 0 }}>
          <thead>
            <tr className="border-b-2 border-gray-400">
              <th className="text-left px-1.5 py-0.5 font-medium w-[16%]">ร้านค้า</th>
              <th className="text-left px-1.5 py-0.5 font-medium w-[24%]">รายการ (รุ่น·กุ๊น·หนา·ผ้า)</th>
              <th className="text-left px-1.5 py-0.5 font-medium w-[7%]">ไซส์</th>
              <th className="text-right px-1.5 py-0.5 font-medium w-[7%]">ค้างเดิม</th>
              <th className="text-right px-1.5 py-0.5 font-medium w-[7%]">ของใหม่</th>
              <th className="text-left px-1.5 py-0.5 font-medium w-[20%]">ขีดนับ</th>
              <th className="text-center px-1.5 py-0.5 font-medium w-[9%]">รวมขึ้น</th>
              <th className="text-center px-1.5 py-0.5 font-medium w-[9%]">คงค้าง</th>
            </tr>
          </thead>
          <tbody>
            {trip.drops.length === 0 && (
              <tr>
                <td colSpan={8} className="px-1.5 py-1 text-gray-400 text-xs">— ไม่มีจุดส่ง —</td>
              </tr>
            )}
            {trip.drops.map((drop) => {
              const groups = groupDropLines(drop.lines);
              const dropRowCount = groups.reduce((s, g) => s + g.rows.length, 0) || 1;
              // ลำดับขึ้นรถ = ย้อนลำดับส่ง (จุดที่ส่งทีหลังสุด โหลดขึ้นรถก่อนสุด)
              const loadOrder = totalDrops - drop.seq + 1;
              const loadHint = loadOrder === 1 ? " · ขึ้นก่อน" : loadOrder === totalDrops ? " · ขึ้นทีหลัง" : "";
              let dropCellRendered = false;
              if (groups.length === 0) {
                return (
                  <tr key={drop.id} className="border-b border-gray-400" style={{ height: "34pt", verticalAlign: "top" }}>
                    <td className="px-1.5 py-1 border-r border-gray-400 align-top">
                      <span className="font-medium">{customerNameById.get(drop.customerId) ?? "—"}</span>
                      {drop.branchId && <span className="block text-[10px] text-gray-500">{branchNameById.get(drop.branchId) ?? ""}</span>}
                      <span className="block text-[10px] text-gray-500">
                        ลงจุดที่ {drop.seq}/{totalDrops}{loadHint}
                      </span>
                    </td>
                    <td colSpan={7} className="px-1.5 py-1 text-gray-400 text-xs border-l border-gray-400">— ไม่มีรายการ —</td>
                  </tr>
                );
              }
              return groups.flatMap((group, gIdx) =>
                group.rows.map((row, rIdx) => {
                  const isFirstOfDrop = !dropCellRendered;
                  if (isFirstOfDrop) dropCellRendered = true;
                  return (
                    <tr key={`${drop.id}-${gIdx}-${rIdx}`} className="border-b border-gray-400" style={{ height: "34pt", verticalAlign: "top" }}>
                      {isFirstOfDrop && (
                        <td rowSpan={dropRowCount} className="px-1.5 py-1 border-r border-gray-400 align-top">
                          <span className="font-medium">{customerNameById.get(drop.customerId) ?? "—"}</span>
                          {drop.branchId && <span className="block text-[10px] text-gray-500">{branchNameById.get(drop.branchId) ?? ""}</span>}
                          <span className="block text-[10px] text-gray-500">
                            ลงจุดที่ {drop.seq}/{totalDrops}{loadHint}
                          </span>
                        </td>
                      )}
                      {rIdx === 0 && (
                        <td rowSpan={group.rows.length} className="px-1.5 py-1 border-r border-gray-400 align-top">
                          <span className="font-medium">{group.label}</span>
                          {group.sku && <span className="block text-[10px] text-gray-500 font-mono">{group.sku}</span>}
                        </td>
                      )}
                      <td className="px-1.5 py-1 border-r border-gray-400">{row.size ?? "-"}</td>
                      <td className="px-1.5 py-1 text-right border-r border-gray-400">{row.outstanding || ""}</td>
                      <td className="px-1.5 py-1 text-right font-semibold border-r border-gray-400">{row.fresh || ""}</td>
                      <td className="px-1.5 py-1 border-r border-gray-400">
                        <TallyBoxes />
                        {row.note && <div className="text-[10px] text-gray-600 mt-0.5">หมายเหตุ: {row.note}</div>}
                      </td>
                      <td className="px-1.5 py-1 border-r border-gray-400" />
                      <td className="px-1.5 py-1" />
                    </tr>
                  );
                })
              );
            })}
          </tbody>
        </table>

        {/* พื้นที่เขียนมือหน้างาน — กระดาษล้วน ไม่มีความหมายในระบบจนกว่าจะบันทึกตอนบันทึกผล — หน้าสุดท้ายหน้าเดียวตามสเปก */}
        <div className="mt-3 print-keep-together">
          <div className="bg-gray-100 print:bg-gray-100 border border-gray-700 border-b-0 rounded-t px-2 py-0.5 font-semibold">
            รายการเพิ่มหน้างาน (เขียนมือ — นำเข้าระบบตอนบันทึกผลขึ้นของ)
          </div>
          <table className="w-full border border-gray-400 text-[13px]" style={{ borderCollapse: "collapse", borderSpacing: 0 }}>
            <tbody>
              {Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-b border-gray-400" style={{ verticalAlign: "top" }}>
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[16%]" style={{ height: "34pt" }} />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[24%]" />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[7%]" />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[7%]" />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[7%]" />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[20%]">
                    <TallyBoxes />
                  </td>
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[9%]" />
                  <td className="px-1.5 py-1 w-[9%]" />
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-gray-500 mt-0.5">คอลัมน์: ร้านค้า / รายการ / ไซส์ / ค้างเดิม / ของใหม่ / ขีดนับ / รวมขึ้น / คงค้าง</div>
        </div>
      </div>
    </div>
  );
}
