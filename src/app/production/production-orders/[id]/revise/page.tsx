import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getProductionSettings } from "@/lib/production-settings";
import { loadMasterSpecOptionsForLines } from "@/lib/master-spec-prefill";
import { reviseProductionOrder } from "../../actions";
import { ProductionOrderForm, type EligibleLine, type ProductionOrderFormInitial } from "@/components/production/production-order-form";
import { displayProdNo } from "@/lib/production-order-display";

// S3 CP3 — ออก Revision ใหม่: eligibleLines ดึงจาก CustomerPO สดๆ ตอนนี้ (ไม่ใช่แค่ที่เคย
// อยู่ใน Revision เดิม) เพื่อให้รวมบรรทัดที่เพิ่งผูกสินค้า/เพิ่มใหม่ใน P.O. ได้ด้วย — บรรทัดที่
// เคยอยู่ใน Revision เดิมแต่ตอนนี้ไม่ active แล้ว (ถูกลบระหว่างแก้ไข P.O.) จะหายจากตัวเลือก
// โดยธรรมชาติ (ประวัติเดิมใน Revision เก่ายังอยู่ครบ ไม่ถูกกระทบ)
export default async function ReviseProductionOrderPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [order, settings] = await Promise.all([
    db.productionOrder.findUnique({
      where: { id: params.id },
      include: {
        customerPo: {
          include: {
            lines: {
              where: { active: true, lineKind: "CATALOG" },
              include: { product: { select: { id: true, sku: true, name: true, productionLabel: true, parentProductId: true, modelId: true } } },
              orderBy: { id: "asc" },
            },
          },
        },
      },
    }),
    getProductionSettings(),
  ]);
  if (!order) notFound();

  const currentRevision = await db.productionOrderRevision.findUnique({
    where: { productionOrderId_revNo: { productionOrderId: order.id, revNo: order.currentRevNo } },
    include: { items: { include: { fabrics: { orderBy: [{ placement: "asc" }, { seq: "asc" }] }, layers: { orderBy: { seq: "asc" } } } } },
  });

  const eligibleLines: EligibleLine[] = order.customerPo.lines.map((line) => ({
    id: line.id,
    productLabel: line.product?.productionLabel ?? line.product?.name ?? "—",
    sku: line.product?.sku ?? null,
    size: line.size,
    qtyCurrent: line.qtyCurrent,
  }));

  const initial: ProductionOrderFormInitial = {
    baseRevNo: order.currentRevNo,
    items: (currentRevision?.items ?? [])
      .filter((item) => item.customerPoLineId && eligibleLines.some((l) => l.id === item.customerPoLineId))
      .map((item) => ({
        customerPoLineId: item.customerPoLineId!,
        qty: item.qty,
        gussetCount: item.gussetCount,
        thickness: item.thickness,
        note: item.note,
        fabrics: item.fabrics.map((f) => ({
          placement: f.placement,
          fabricName: f.fabricName,
          fabricCode: f.fabricCode,
          waddingWeight: f.waddingWeight,
          foamThickness: f.foamThickness,
          colorNote: f.colorNote,
          displayOverride: f.displayOverride,
          printVisible: f.printVisible,
        })),
        layers: item.layers.map((l) => ({ material: l.material, spec: l.spec, displayOverride: l.displayOverride, printVisible: l.printVisible })),
      })),
  };

  const masterSpecOptions = await loadMasterSpecOptionsForLines(order.customerPo.lines);
  const reviseAction = reviseProductionOrder.bind(null, order.id);

  return (
    <div className="max-w-2xl">
      <a href={`/production/production-orders/${order.id}`} className="text-sm text-blue-600 hover:underline">
        ← กลับไปดูใบสั่งผลิต
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">ออก Revision ใหม่ — {displayProdNo(order.prodNo, order.currentRevNo)}</h1>
      <p className="text-sm text-gray-500 mb-4">
        Revision เดิม (Rev.{order.currentRevNo}) จะยังอยู่ครบ เปิดดูย้อนหลังได้เสมอ — แก้ไขด้านล่างแล้วกด
        &quot;ออก Revision ใหม่&quot; จะสร้าง Rev.{order.currentRevNo + 1} แทนการเขียนทับของเดิม
      </p>

      {eligibleLines.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500">
          P.O. ต้นทางไม่มีรายการที่ผูกกับสินค้าในระบบแล้ว (ต้องไปแก้ไข P.O. เพื่อผูกสินค้าก่อน)
        </div>
      ) : (
        <ProductionOrderForm
          eligibleLines={eligibleLines}
          maxGussetCount={settings.maxGussetCount}
          maxFabricsPerPlacement={settings.maxFabricsPerPlacement}
          action={reviseAction}
          initial={initial}
          masterSpecOptions={masterSpecOptions}
        />
      )}
    </div>
  );
}
