import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company-settings";
import { getProductionSettings } from "@/lib/production-settings";
import { printPageStyleFor, PRINT_PROFILES } from "@/lib/print-settings";
import { ProductionPrintControls } from "@/components/production/production-print-controls";
import { displayProdNo } from "@/lib/production-order-display";
import { groupItemsBySpecHash } from "@/lib/production-item-grouping";
import { startProductionAndMarkPrint } from "../../actions";

// S4 UAT (2026-08-29) — Compact layout ตาม Owner feedback + mockup: header ยุบเหลือ ~2
// บรรทัด + meta บรรทัดเดียว, block ต่อสเปกใช้ grid ซ้าย (ไซส์/จำนวน) ขวา (ผ้า/โครงสร้าง),
// ผ้ารวมบรรทัดเมื่อสเปกเหมือนกันทุกตำแหน่ง (ไม่ตัด canonical ทิ้ง — รวมได้เฉพาะที่เท่ากัน
// เป๊ะทุก field), โครงสร้างไหล 2 คอลัมน์ซ้าย→ขวา — printVisible/displayOverride behavior
// เดิมคงอยู่, note ระดับไซส์แสดงท้าย block ไม่หายจาก grouping
//
// สำเนา: printCopies ชุดเนื้อหาเหมือนกันทั้งหมด ไม่มี department banner แล้ว (Owner สั่งแยก
// concept จำนวนสำเนาออกจากชื่อแผนก) — label เล็กๆ "สำเนา i/N" ที่หัวกระดาษพอ
//
// สถานะ: ปุ่ม "ยืนยันเริ่มผลิตและพิมพ์" (explicit) เปลี่ยน status ครั้งแรกครั้งเดียว —
// การเปิดหน้านี้ (Preview) และการพิมพ์ซ้ำไม่เปลี่ยน state ใดๆ (ดู production-print-controls)

const DATE_MODE_LABEL: Record<string, string> = {
  UNSET: "ยังไม่กำหนด",
  ESTIMATE: "ประมาณ",
  EXACT: "ระบุชัด",
};

// ป้ายภาษาไทยของ placement บนใบพิมพ์ — display เท่านั้น (canonical ยังเป็นรหัสเดิมใน DB)
// มาจากคำในเอกสารสเปกต้นฉบับของ Owner เป๊ะ (ผ้าบน/ผ้าล่าง/ผ้าข้าง/ผ้าปีก/ผ้าหัว ท้าย/
// ผ้าทั้งหลัง) — placement ที่ไม่รู้จักแสดงรหัสดิบตามเดิม ไม่เดา
const PLACEMENT_TH: Record<string, string> = {
  TOP: "บน",
  BOTTOM: "ล่าง",
  SIDE: "ข้าง",
  HEAD_TAIL: "หัว-ท้าย",
  WING: "ปีก",
  WHOLE: "ทั้งหลัง",
};

type FabricRow = {
  placement: string;
  seq: number;
  fabricName: string;
  fabricCode: string | null;
  waddingWeight: string | null;
  foamThickness: string | null;
  colorNote: string | null;
  displayOverride: string | null;
};

function fabricText(f: FabricRow): string {
  if (f.displayOverride) return f.displayOverride;
  let text = f.fabricName;
  if (f.waddingWeight) text += ` + ใย ${f.waddingWeight}`;
  if (f.foamThickness) text += ` + ฟ.${f.foamThickness}`;
  if (f.colorNote) text += ` (${f.colorNote})`;
  return text;
}

function placementLabel(f: FabricRow, all: FabricRow[]): string {
  const base = PLACEMENT_TH[f.placement] ?? f.placement;
  const samePlacement = all.filter((x) => x.placement === f.placement).length;
  return samePlacement > 1 ? `${base} (${f.seq + 1})` : base;
}

/** รวมผ้าที่สเปกเหมือนกันเป๊ะทุก field เข้าเป็นบรรทัดเดียว (label ตำแหน่งต่อกันด้วย "/") —
 * ไม่มีทางเสียข้อมูล เพราะรวมได้เฉพาะที่เนื้อหาเท่ากันทุกตัวอักษรเท่านั้น (เช่น Falcon ที่
 * บน/หัว-ท้าย/ล่าง ใช้ผ้าเดียวกัน → "บน/หัว-ท้าย/ล่าง: JQ ...") ผ้าที่ต่างกันยังแยกบรรทัด */
function mergeIdenticalFabrics(fabrics: FabricRow[]): { label: string; text: string }[] {
  const order: string[] = [];
  const grouped = new Map<string, { labels: string[]; text: string }>();
  for (const f of fabrics) {
    const key = JSON.stringify([f.fabricName, f.fabricCode, f.waddingWeight, f.foamThickness, f.colorNote, f.displayOverride]);
    if (!grouped.has(key)) {
      grouped.set(key, { labels: [], text: fabricText(f) });
      order.push(key);
    }
    grouped.get(key)!.labels.push(placementLabel(f, fabrics));
  }
  return order.map((key) => {
    const g = grouped.get(key)!;
    return { label: g.labels.join("/"), text: g.text };
  });
}

export default async function ProductionOrderPrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "productionOrder.print")) redirect("/");

  const [order, company, settings] = await Promise.all([
    db.productionOrder.findUnique({
      where: { id: params.id },
      include: {
        customerPo: {
          select: {
            orderSeqNo: true,
            createdAt: true,
            dateMode: true,
            requestedDate: true,
            urgency: true,
            customer: { select: { companyName: true, code: true } },
            branch: { select: { name: true } },
          },
        },
      },
    }),
    getCompanySettings(),
    getProductionSettings(),
  ]);
  if (!order) notFound();

  const revision = await db.productionOrderRevision.findUnique({
    where: { productionOrderId_revNo: { productionOrderId: order.id, revNo: order.currentRevNo } },
    include: {
      items: {
        include: {
          fabrics: { orderBy: [{ placement: "asc" }, { seq: "asc" }] },
          layers: { orderBy: { seq: "asc" } },
        },
      },
    },
  });
  if (!revision) notFound();

  const groups = groupItemsBySpecHash(revision.items);
  const prodNoDisplay = displayProdNo(order.prodNo, order.currentRevNo);
  const copies = Array.from({ length: settings.printCopies }, (_, i) => i + 1);

  const startedBy = order.productionStartedById
    ? await db.user.findUnique({ where: { id: order.productionStartedById }, select: { displayName: true, username: true } })
    : null;
  const startAction = startProductionAndMarkPrint.bind(null, order.id);

  const po = order.customerPo;
  const metaParts: { label: string; value: string }[] = [
    { label: "ลูกค้า", value: `${po.customer.companyName} (${po.customer.code})` },
    ...(po.branch ? [{ label: "สาขา", value: po.branch.name }] : []),
    ...(po.orderSeqNo != null ? [{ label: "สั่งครั้งที่", value: String(po.orderSeqNo) }] : []),
    { label: "วันที่สั่ง", value: po.createdAt.toLocaleDateString("th-TH") },
    {
      label: "วันที่ต้องการ",
      value: `${DATE_MODE_LABEL[po.dateMode] ?? po.dateMode}${po.requestedDate ? ` ${po.requestedDate.toLocaleDateString("th-TH")}` : ""}`,
    },
    { label: "สถานะ", value: order.status },
  ];

  const copyBody = (copyNo: number) => (
    <>
      {/* Header ยุบเหลือ 2 บรรทัด + เส้นคั่น (ตาม mockup) */}
      <div className="flex items-baseline justify-between border-b-2 border-gray-800 pb-1 mb-1">
        <div>
          <span className="font-semibold text-[length:var(--print-heading-size)]">{company.name}</span>
          <span className="text-[10px] text-gray-500 ml-2">ใบสั่งผลิต — เอกสารภายใน</span>
        </div>
        <div className="text-right">
          <span className="font-semibold text-[length:var(--print-heading-size)]">{prodNoDisplay}</span>
          <span className="text-[10px] text-gray-500 ml-2">สำเนา {copyNo}/{settings.printCopies}</span>
        </div>
      </div>

      {/* Meta บรรทัดเดียว (wrap เมื่อยาวจริง) */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs border-b pb-1 mb-2">
        {metaParts.map((m) => (
          <span key={m.label}>
            <span className="text-gray-500">{m.label}:</span> <span className="font-medium">{m.value}</span>
          </span>
        ))}
        {po.urgency && <span className="font-semibold">⚑ ด่วน</span>}
      </div>

      <div className="space-y-2">
        {groups.map((group) => {
          const visibleFabrics = group.representative.fabrics.filter((f) => f.printVisible);
          const visibleLayers = group.representative.layers.filter((l) => l.printVisible);
          const fabricRows = mergeIdenticalFabrics(visibleFabrics);
          const notes = group.items.filter((item) => item.note);
          return (
            <div key={group.specHash} className="print-keep-together border border-gray-700 rounded">
              {/* หัว block: ชื่อ · กุ๊น · ความหนา | รวม */}
              <div className="flex items-center justify-between bg-gray-100 print:bg-gray-100 px-2 py-0.5 border-b border-gray-700">
                <span className="font-semibold text-sm">
                  {group.representative.productionLabelSnapshot ?? group.representative.nameSnapshot ?? "—"}
                  {group.representative.gussetCount != null && <span className="font-normal"> · {group.representative.gussetCount} กุ๊น</span>}
                  {group.representative.thickness && <span className="font-normal"> · หนา {group.representative.thickness}&quot;</span>}
                </span>
                <span className="text-xs font-medium">รวม {group.totalQty} ชิ้น</span>
              </div>

              <div className="grid grid-cols-[7rem_1fr] gap-x-3 p-2">
                {/* ซ้าย: ไซส์/จำนวน compact */}
                <table className="text-xs self-start w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-0.5 font-medium">ไซส์</th>
                      <th className="text-right py-0.5 font-medium">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id} className="border-b border-dashed">
                        <td className="py-0.5">{item.size ?? "-"}</td>
                        <td className="text-right py-0.5 font-semibold">{item.qty}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-0.5 font-medium">รวม</td>
                      <td className="text-right py-0.5 font-semibold">{group.totalQty}</td>
                    </tr>
                  </tbody>
                </table>

                {/* ขวา: ผ้า + โครงสร้าง */}
                <div className="text-xs min-w-0">
                  <div className="mb-1">
                    {fabricRows.map((row, i) => (
                      <div key={i}>
                        <span className="text-gray-600">ผ้า {row.label}:</span> <span className="font-medium">{row.text}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-gray-600 border-t pt-0.5">โครงสร้าง (บน → ล่าง)</div>
                  {/* ไหล 2 คอลัมน์ซ้าย→ขวา ประหยัดแนวตั้ง — ข้อความยาว wrap ในคอลัมน์เอง ไม่ตัดทิ้ง */}
                  <div style={{ columnCount: 2, columnGap: "1rem" }}>
                    {visibleLayers.map((l, i) => (
                      <div key={l.id} style={{ breakInside: "avoid" }}>
                        {i + 1}. {l.displayOverride ?? `${l.material} ${l.spec}`}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* note ระดับไซส์ — ต้องไม่หายจาก grouping */}
              {notes.length > 0 && (
                <div className="text-xs border-t border-gray-300 px-2 py-0.5">
                  <span className="text-gray-600">หมายเหตุ:</span>{" "}
                  {notes.map((item, i) => (
                    <span key={item.id}>
                      {i > 0 && " · "}
                      {item.size ? `[${item.size}] ` : ""}
                      {item.note}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <style
        id="print-page-style"
        dangerouslySetInnerHTML={{
          __html: `@media print { ${printPageStyleFor("a4")} } :root { --print-content-height: ${PRINT_PROFILES.a4.contentHeightMm}mm; }`,
        }}
      />
      <ProductionPrintControls
        started={!!order.productionStartedAt}
        startedLabel={
          order.productionStartedAt
            ? `${order.productionStartedAt.toLocaleString("th-TH")}${startedBy ? ` โดย ${startedBy.displayName || startedBy.username}` : ""}`
            : undefined
        }
        inProgressStatus={settings.inProgressStatus}
        backHref={`/production/production-orders/${order.id}`}
        startAction={startAction}
      />
      <div className="print:hidden text-xs text-gray-500 mb-2">จะพิมพ์ {settings.printCopies} สำเนา (เนื้อหาเหมือนกันทุกชุด) — A4</div>

      <div className="bg-white border print:border-0 rounded-lg print:rounded-none p-6 text-sm">
        {copies.map((copyNo) => (
          <section key={copyNo} style={copyNo > 1 ? { breakBefore: "page" } : undefined}>
            {copyBody(copyNo)}
          </section>
        ))}
      </div>
    </div>
  );
}
