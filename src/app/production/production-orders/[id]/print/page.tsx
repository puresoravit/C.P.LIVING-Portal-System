import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company-settings";
import { getProductionSettings } from "@/lib/production-settings";
import { printPageStyleFor, PRINT_PROFILES } from "@/lib/print-settings";
import { PrintButton } from "@/components/print-button";
import { PrintDocumentHeader } from "@/components/print/print-document-header";
import { PrintDocumentTitle } from "@/components/print/print-document-title";
import { PrintCustomerInfo } from "@/components/print/print-customer-info";
import { displayProdNo } from "@/lib/production-order-display";
import { groupItemsBySpecHash } from "@/lib/production-item-grouping";

// S4 — Print Preview (first usable version, ไม่ Visual Polish ละเอียด) ใช้ Revision
// ปัจจุบันเป็น source เดียวเสมอ (ตรงกับ CLAUDE.md ข้อ 6: "พิมพ์แล้วแก้ = ออก Rev ใหม่
// ต้องพิมพ์ใหม่ครบทั้ง 8 ชุด" — พิมพ์ Rev เก่าไม่ใช่ use case ปกติ ไม่ทำในรอบนี้)
//
// A4 เท่านั้น (ตามที่ Owner ตั้งชื่อ Checkpoint) — ไม่ใช้ PrintPage/PrintProfileSelector
// เดิม (ค่าเริ่มต้นเป็น continuous 9x11 สำหรับ EPSON LQ-310 ของ Billing ซึ่งไม่เกี่ยวกับ
// เอกสารนี้เลย) เรียก printPageStyleFor("a4") ตรงๆ แทน — reuse ค่า margin ที่ Owner เคย
// จูนกับกระดาษจริงแล้วรอบ Billing R4
//
// พิมพ์ตามจำนวนชุด/แผนกจาก production-settings.ts (departments) — เอกสารเดียวกันซ้ำ
// ตามจำนวนที่ตั้งค่าไว้ พร้อม stamp ชื่อแผนก/ลำดับชุดต่อสำเนา ให้แยกส่งแต่ละแผนกได้
// ไม่ break-inside:avoid แบบ .print-doc-page เดิม (นั่นออกแบบมาคู่กับ paginateRows ที่
// คำนวณให้พอดี 1 หน้าเป๊ะ ที่นี่ไม่ได้ pre-paginate จึงปล่อย flow ธรรมชาติ + บังคับแค่
// break-before ระหว่างสำเนาแทน)
export default async function ProductionOrderPrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "productionOrder.print")) redirect("/");

  const [order, company, settings] = await Promise.all([
    db.productionOrder.findUnique({
      where: { id: params.id },
      include: {
        customerPo: { include: { customer: { select: { companyName: true, code: true } }, branch: { select: { name: true } } } },
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

  // ชุดที่จะพิมพ์ทั้งหมด: department × copies ตามการตั้งค่า (default 8 ชุด: ผ้า×3,
  // โครงสร้าง×3, Box/ฐานเตียง×2) — ไม่ hardcode ชื่อ/จำนวนแผนกในโค้ด
  const copies = settings.departments.flatMap((dept) =>
    Array.from({ length: dept.copies }, (_, i) => ({ departmentName: dept.name, copyNo: i + 1, totalForDept: dept.copies }))
  );

  const headerNode = (
    <>
      <PrintDocumentHeader company={company} />
      <PrintDocumentTitle titleTh="ใบสั่งผลิต (เอกสารภายใน ไม่ใช่เอกสารสำหรับลูกค้า)" titleEn="PRODUCTION ORDER (INTERNAL USE ONLY)" />
      <PrintCustomerInfo
        left={[
          { label: "ลูกค้า", value: order.customerPo.customer.companyName },
          { label: "สาขา", value: order.customerPo.branch?.name ?? "-" },
        ]}
        right={[
          { label: "เลขที่", value: prodNoDisplay },
          { label: "สถานะ", value: order.status },
        ]}
      />
    </>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <style
        id="print-page-style"
        dangerouslySetInnerHTML={{ __html: `@media print { ${printPageStyleFor("a4")} } :root { --print-content-height: ${PRINT_PROFILES.a4.contentHeightMm}mm; }` }}
      />
      <div className="print:hidden flex flex-wrap items-center gap-3 mb-2">
        <PrintButton backHref={`/production/production-orders/${order.id}`} />
        <span className="text-xs text-gray-500">
          จะพิมพ์ {copies.length} ชุด ({settings.departments.map((d) => `${d.name} ${d.copies}`).join(" / ")}) — A4
        </span>
      </div>

      <div className="bg-white border print:border-0 rounded-lg print:rounded-none p-6 text-sm">
        {copies.map((copy, idx) => (
          <section key={idx} style={idx > 0 ? { breakBefore: "page" } : undefined}>
            {headerNode}
            <div className="text-center text-xs font-medium bg-gray-100 print:bg-gray-100 rounded py-1 mb-2">
              สำเนาแผนก: {copy.departmentName} (ชุดที่ {copy.copyNo}/{copy.totalForDept})
            </div>

            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.specHash} className="print-keep-together border rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{group.representative.productionLabelSnapshot ?? group.representative.nameSnapshot ?? "—"}</span>
                    <span className="text-xs">
                      {group.representative.gussetCount != null && `กุ๊น ${group.representative.gussetCount} · `}
                      {group.representative.thickness && `หนา ${group.representative.thickness}" · `}
                      รวม {group.totalQty} ชิ้น
                    </span>
                  </div>
                  <div className="text-xs mb-1.5">
                    ไซส์: {group.items.map((item) => `${item.size ?? "ไม่ระบุ"}×${item.qty}`).join(", ")}
                  </div>

                  <table className="print-table w-full text-xs mb-1.5">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-0.5 w-20">ตำแหน่ง</th>
                        <th className="text-left py-0.5">ผ้า</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.representative.fabrics
                        .filter((f) => f.printVisible)
                        .map((f) => (
                          <tr key={f.id} className="border-b border-dashed">
                            <td className="py-0.5">{f.placement}</td>
                            <td className="py-0.5">
                              {f.displayOverride ?? f.fabricName}
                              {f.waddingWeight && ` + ใย ${f.waddingWeight}`}
                              {f.foamThickness && ` + ฟ.${f.foamThickness}`}
                              {f.colorNote && ` (${f.colorNote})`}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>

                  <table className="print-table w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-0.5 w-8">#</th>
                        <th className="text-left py-0.5">โครงสร้าง (บนลงล่าง)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.representative.layers
                        .filter((l) => l.printVisible)
                        .map((l, i) => (
                          <tr key={l.id} className="border-b border-dashed">
                            <td className="py-0.5">{i + 1}</td>
                            <td className="py-0.5">{l.displayOverride ?? `${l.material} ${l.spec}`}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
