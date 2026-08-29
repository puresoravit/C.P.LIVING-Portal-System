import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getProductionSettings } from "@/lib/production-settings";
import { loadMasterSpecOptionsForLines } from "@/lib/master-spec-prefill";
import { createProductionOrder } from "../actions";
import { ProductionOrderForm, type EligibleLine } from "@/components/production/production-order-form";
import { BackLink } from "@/components/production/back-link";

// S3 CP1 — Entry point เดียวคือมาจากปุ่ม "สร้างใบสั่งผลิต" บนหน้า detail ของ CustomerPO
// (ดู src/app/production/orders/[id]/page.tsx) — เฉพาะบรรทัดที่ active + lineKind=CATALOG
// (ผูกสินค้าแล้ว) เท่านั้นที่เลือกเข้าใบสั่งผลิตได้ ตาม decision ที่ยืนยันไว้
export default async function NewProductionOrderPage(props: { searchParams: Promise<{ customerPoId?: string }> }) {
  const searchParams = await props.searchParams;
  const customerPoId = searchParams.customerPoId;
  if (!customerPoId) notFound();

  const [po, settings] = await Promise.all([
    db.customerPO.findUnique({
      where: { id: customerPoId },
      include: {
        customer: { select: { companyName: true, code: true } },
        lines: {
          where: { active: true, lineKind: "CATALOG" },
          include: { product: { select: { id: true, sku: true, name: true, productionLabel: true, parentProductId: true, modelId: true } } },
          orderBy: { id: "asc" },
        },
      },
    }),
    getProductionSettings(),
  ]);
  if (!po) notFound();

  const eligibleLines: EligibleLine[] = po.lines.map((line) => ({
    id: line.id,
    productLabel: line.product?.productionLabel ?? line.product?.name ?? "—",
    sku: line.product?.sku ?? null,
    size: line.size,
    qtyCurrent: line.qtyCurrent,
  }));

  const masterSpecOptions = await loadMasterSpecOptionsForLines(po.lines);
  const createAction = createProductionOrder.bind(null, po.id);

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref={`/production/orders/${po.id}`} />
      <h1 className="text-lg font-semibold mt-2 mb-1">สร้างใบสั่งผลิต</h1>
      <p className="text-sm text-gray-500 mb-4">
        จากออเดอร์ {po.customer.companyName} ({po.customer.code}) — เลือกรายการที่จะผลิต แล้วกรอกสเปกให้ครบ
        กด &quot;ยืนยัน/ออกใบสั่งผลิต&quot; แล้วแก้ไขไม่ได้ (ต้องกดแก้ไขใบสั่งผลิตถ้าจะแก้)
      </p>

      {eligibleLines.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500">
          ออเดอร์นี้ยังไม่มีรายการที่ผูกกับสินค้าในระบบแล้ว (ต้องไปแก้ไขออเดอร์เพื่อผูกสินค้าให้รายการที่ยังเป็น
          &quot;ยังไม่มีในระบบ&quot; ก่อน)
        </div>
      ) : (
        <ProductionOrderForm
          eligibleLines={eligibleLines}
          maxGussetCount={settings.maxGussetCount}
          maxFabricsPerPlacement={settings.maxFabricsPerPlacement}
          action={createAction}
          masterSpecOptions={masterSpecOptions}
        />
      )}
    </div>
  );
}
