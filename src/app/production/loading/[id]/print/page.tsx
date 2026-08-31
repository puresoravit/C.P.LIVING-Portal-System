import type { CSSProperties } from "react";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { LoadingSheetControls } from "@/components/production/loading-sheet-controls";
import { confirmSheetPrinted } from "../../actions";

// CP2/CP7 — ใบขึ้นของ A4 "แนวตั้ง" (เปลี่ยนจากแนวนอนตอน CP7 round 2 — Owner: แนวตั้งประหยัด
// กระดาษกว่าและสูงพอใส่รายการได้เยอะกว่า): เอกสาร planned loading สำหรับพนักงานขีด tally
// หน้างาน เรียงตามลำดับจุดส่ง — การพิมพ์ไม่ mutate อะไรเลย (ไม่ตั้ง qtyLoaded/ไม่ reconcile/
// ไม่สร้างของค้าง — "พิมพ์" ≠ "ยืนยันขึ้นของ") — กันกระดาษเก่ากลายเป็น source of truth เงียบๆ
// ด้วยการพิมพ์ "เวอร์ชันแผน N + เวลาพิมพ์" บนหัวใบ: แผนแก้เมื่อไหร่ version ขยับ กระดาษเก่า
// เทียบกับหน้าจอแล้วรู้ทันทีว่าตกรุ่น
//
// CP7 (2026-08-30, Owner UAT) — สร้างใหม่ตามสเปกเดิม docs/production-module/01-สรุปรวม.md
// (ตกหล่นตอน CP2): คอลัมน์ ร้านค้า|รายการ|ไซส์|ค้างเดิม|จำนวนผลิต|จำนวน|รวมขึ้น|ค้างส่ง (ชื่อ
// คอลัมน์หลังปรับตาม UAT round 4 — เดิมชื่อ ของใหม่/ขีดนับ/คงค้าง) เป็นตารางต่อเนื่องเดียวทั้งใบ
// (ไม่แยกตารางต่อจุดส่งเหมือนเดิม) + 2 ตัวนับรีเซ็ตรายเดือน (เที่ยวที่/รอบรถคันนี้ — ตัดตัวนับ
// "รอบภาค" ออกจากใบพิมพ์ตอน round 4 แม้ยังเก็บ destinationLabel ในระบบ) นับที่ "ออกจริง"
// (reconciledAt ไม่ null) เที่ยวที่ยกเลิกก่อนออกไม่กินเลขโดยธรรมชาติ (ไม่เคยมี reconciledAt) —
// ลำดับขึ้นรถ = สลับกับลำดับส่ง (โหลดจุดที่ส่งทีหลังก่อน)
//
// @page CSS เขียนเฉพาะหน้านี้ ไม่เพิ่ม key ใน PRINT_PROFILES เด็ดขาด — profile ตัวนั้นถูก
// enumerate ใน dropdown ของ Billing (PrintProfileSelector/print-template-designer) เพิ่ม
// key = โผล่ในหน้า Billing ทันที (ห้ามแตะ Billing) — margin box ว่างใช้สูตรเดียวกับ
// printPageStyleFor ใน print-settings.ts

const EMPTY_MARGIN_BOXES =
  "@top-left { content: '' } @top-center { content: '' } @top-right { content: '' } " +
  "@bottom-left { content: '' } @bottom-center { content: '' } @bottom-right { content: '' }";
const PORTRAIT_PAGE_STYLE = `@page { size: A4 portrait; margin: 8mm 8mm; ${EMPTY_MARGIN_BOXES} }`;

/** ความสูงแถวสินค้าทุกแถวในตาราง — ใช้เป็น "อย่างน้อย" (แถวยาวขึ้นได้เองถ้ารายการชื่อยาวจนตัดบรรทัด) */
const ROW_HEIGHT = "34pt";
/** จำนวนช่องขีดต่อแถว — CP7 round 6 (Owner): ลดจาก 6 เหลือ 5 ช่อง ให้ตรงกับนิสัยขีดจริง
    (ขีดเต็มช่อง = นับ 5 พอดี ไม่ต้องมานั่งคิดเลข 6 คูณ) */
const TALLY_BOX_COUNT = 5;

/** CP7 round 6→7 — ลองมา 2 วิธีแล้วแก้ไม่หมด: (1) flex-1 สะสมเศษพิกเซลไม่เท่ากัน (2) h-full
    (height:100%) บน div ลูกใน <td> คำนวณเป็น 0 เพราะ td ไม่มี height แบบ definite ของตัวเอง
    (3) ให้ความสูงตายตัว 34pt ตรงกับ <tr> ก็ยังพังอีกกับแถวที่ชื่อรายการยาวจนตัดบรรทัด (แถวสูง
    กว่า 34pt จริง เส้นเลยไม่ถึงขอบล่าง) — รากปัญหาคือพยายามให้ "ลูก" รู้ความสูงของ "พ่อ" ที่ยัง
    ไม่นิ่งจนกว่า layout เสร็จ วิธีที่ถูกคือไม่พึ่งความสูงของลูกเลย ใช้ background-image วาดเส้น
    ตรงบน td ตัวเอง (background วาดเต็มกล่องของ element เสมอไม่ว่าความสูงจริงจะเท่าไร ไม่มีปัญหา
    percentage-height ให้แก้อีกจากนี้) — คำนวณตำแหน่งเส้นแบ่ง (TALLY_BOX_COUNT-1 เส้น) ครั้งเดียว */
const TALLY_DIVIDER_COLOR = "#9ca3af"; // เทียบเท่า Tailwind gray-400 ที่ใช้เป็นเส้นตารางทั้งหน้า
const tallyCellStyle: CSSProperties = {
  backgroundImage: Array(TALLY_BOX_COUNT - 1).fill(`linear-gradient(${TALLY_DIVIDER_COLOR}, ${TALLY_DIVIDER_COLOR})`).join(", "),
  backgroundSize: "1px 100%",
  backgroundRepeat: "no-repeat",
  backgroundPosition: Array.from({ length: TALLY_BOX_COUNT - 1 }, (_, i) => `${((i + 1) / TALLY_BOX_COUNT) * 100}% 0`).join(", "),
};

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

  const trip = await db.loadingTrip.findUnique({
    where: { id: params.id },
    include: { drops: { orderBy: { seq: "asc" }, include: { lines: { orderBy: { id: "asc" } } } } },
  });
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

  // CP7 round 4 — Owner: ตัด "ภาค" ออกจากหัวใบพิมพ์ (บรรทัดข้อมูลยาวเกิน อยากให้เหลือบรรทัด
  // เดียว) — ยังเก็บ destinationLabel ต่อจุดส่งไว้ในระบบตามเดิม (ใช้ในหน้าเตรียมของ/รายงาน
  // อนาคต) แค่ไม่แสดง/นับบนใบพิมพ์แผ่นนี้อีกต่อไป

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
    <div className="mx-auto" style={{ maxWidth: "194mm" }}>
      <style id="print-page-style" dangerouslySetInnerHTML={{ __html: `@media print { ${PORTRAIT_PAGE_STYLE} }` }} />
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
        {/* หัวใบ — CP7 round 4 (Owner): เหลือ "บรรทัดเดียว" ต่อบล็อก ตัดชื่อบริษัทออก ใช้ชื่อ
            เอกสารตรงๆ แทน ("ใบขึ้นสินค้า") + ยุบเลขที่/เวลาพิมพ์มาบรรทัดเดียวกัน ส่วนแถว
            ข้อมูลรถ (วันที่/เที่ยวที่/ทะเบียน/คนขับ) ก็ยุบเหลือบรรทัดเดียวเช่นกัน ตัดภาคออก */}
        {/* CP7 round 5 (Owner) — หัวข้อ+รายละเอียดตัวเล็กไป ขยายขึ้น */}
        <div className="flex items-baseline justify-between border-b-2 border-gray-800 pb-1 mb-1">
          <span className="font-bold text-lg">ใบขึ้นสินค้า</span>
          <span className="text-xs text-gray-400">
            <span className="font-mono">{trip.tripNo}</span>
            {trip.cancelledAt && <span className="ml-2 font-semibold text-red-700">[ยกเลิกแล้ว]</span>}
            <span className="ml-2">พิมพ์ {new Date().toLocaleString("th-TH")} · แก้ไขครั้งที่ {trip.version}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm border-b pb-1 mb-2">
          <span><span className="text-gray-500">วันที่:</span> <span className="font-medium">{trip.tripDate.toLocaleDateString("th-TH")}</span></span>
          <span><span className="text-gray-500">เที่ยวที่ (เดือนนี้):</span> <span className="font-medium">{tripSeqThisMonth}</span></span>
          <span>
            <span className="text-gray-500">ทะเบียนรถ:</span>{" "}
            <span className="font-medium">
              {trip.plateNumber ?? "—"}
              {vehicleSeqThisMonth != null && ` (รอบที่ ${vehicleSeqThisMonth})`}
            </span>
          </span>
          <span><span className="text-gray-500">คนขับ:</span> <span className="font-medium">{trip.driverName ?? "—"}</span></span>
          {trip.note && <span><span className="text-gray-500">หมายเหตุ:</span> {trip.note}</span>}
        </div>

        {/* ตารางต่อเนื่องเดียวทั้งใบ: ร้านค้า | รายการ | ไซส์ | ค้างเดิม | จำนวนผลิต | จำนวน | รวมขึ้น | ค้างส่ง
            สีเส้นเดียวกันทั้งตาราง + collapse/spacing ระบุตรงๆ กัน sub-pixel gap ตอนพิมพ์ */}
        <table className="w-full border border-gray-400 text-[13px] print-keep-together" style={{ borderCollapse: "collapse", borderSpacing: 0 }}>
          <thead>
            {/* CP7 round 4 — Owner: หัวตารางไม่มีเส้นแบ่งช่อง (ตัว td ข้างล่างมีแต่ th ไม่มี) ทำให้
                ดูไม่ใช่กริดเดียวกัน + บีบค้างเดิม/จำนวนผลิตให้แคบลง ขยายช่องจำนวน(ขีดนับ)แทน
                + เปลี่ยนชื่อคอลัมน์ตามที่สั่ง: ของใหม่→จำนวนผลิต, ขีดนับ→จำนวน, คงค้าง→ค้างส่ง */}
            <tr className="border-b-2 border-gray-400">
              <th className="text-center px-1.5 py-0.5 font-medium w-[13%] border-r border-gray-400">ร้านค้า</th>
              <th className="text-center px-1.5 py-0.5 font-medium w-[18%] border-r border-gray-400">รายการ (รุ่น·กุ๊น·หนา·ผ้า)</th>
              <th className="text-center px-1.5 py-0.5 font-medium w-[6%] border-r border-gray-400">ไซส์</th>
              <th className="text-center px-1.5 py-0.5 font-medium w-[4%] border-r border-gray-400">ค้างเดิม</th>
              <th className="text-center px-1.5 py-0.5 font-medium w-[5%] border-r border-gray-400">จำนวนผลิต</th>
              <th className="text-center px-1.5 py-0.5 font-medium w-[40%] border-r border-gray-400">จำนวน</th>
              <th className="text-center px-1.5 py-0.5 font-medium w-[7%] border-r border-gray-400">รวมขึ้น</th>
              <th className="text-center px-1.5 py-0.5 font-medium w-[7%]">ค้างส่ง</th>
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
                  <tr key={drop.id} className="border-b border-gray-400" style={{ height: ROW_HEIGHT, verticalAlign: "top" }}>
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
                    <tr key={`${drop.id}-${gIdx}-${rIdx}`} className="border-b border-gray-400" style={{ height: ROW_HEIGHT, verticalAlign: "top" }}>
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
                      <td className="px-1.5 py-1 text-center border-r border-gray-400">{row.size ?? "-"}</td>
                      <td className="px-1.5 py-1 text-center border-r border-gray-400">{row.outstanding || ""}</td>
                      <td className="px-1.5 py-1 text-center font-semibold border-r border-gray-400">{row.fresh || ""}</td>
                      <td className="border-r border-gray-400 align-top" style={tallyCellStyle}>
                        {row.note && <div className="text-[10px] text-gray-600 px-1 py-0.5">หมายเหตุ: {row.note}</div>}
                      </td>
                      <td className="px-1.5 py-1 text-center border-r border-gray-400" />
                      <td className="px-1.5 py-1 text-center" />
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
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[13%]" style={{ height: ROW_HEIGHT }} />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[18%]" />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[6%]" />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[4%]" />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[5%]" />
                  <td className="border-r border-gray-400 w-[40%]" style={tallyCellStyle} />
                  <td className="px-1.5 py-1 border-r border-gray-400 w-[7%]" />
                  <td className="px-1.5 py-1 w-[7%]" />
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-gray-500 mt-0.5">คอลัมน์: ร้านค้า / รายการ / ไซส์ / ค้างเดิม / จำนวนผลิต / จำนวน / รวมขึ้น / ค้างส่ง</div>
        </div>
      </div>
    </div>
  );
}
