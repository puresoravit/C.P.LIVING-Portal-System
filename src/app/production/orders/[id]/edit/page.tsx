import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { updateCustomerPO } from "../../actions";
import { CustomerPOForm, type CustomerPOFormInitial } from "@/components/production/customer-po-form";
import { BackLink } from "@/components/production/back-link";

// S2 Checkpoint 2 — แก้ไข CustomerPO พร้อม Revision History + Optimistic Concurrency
export default async function EditCustomerPOPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [po, customers] = await Promise.all([
    db.customerPO.findUnique({
      where: { id: params.id },
      include: {
        lines: {
          where: { active: true },
          include: { product: { select: { name: true, productionLabel: true } } },
          orderBy: { id: "asc" },
        },
      },
    }),
    db.customer.findMany({
      where: { active: true },
      select: {
        id: true,
        code: true,
        companyName: true,
        branches: { where: { active: true }, select: { id: true, name: true } },
      },
      orderBy: { companyName: "asc" },
    }),
  ]);
  if (!po) notFound();

  const initial: CustomerPOFormInitial = {
    id: po.id,
    version: po.version,
    customerId: po.customerId,
    branchId: po.branchId ?? "",
    dateMode: po.dateMode,
    requestedDate: po.requestedDate ? po.requestedDate.toISOString().slice(0, 10) : "",
    urgency: po.urgency,
    lines: po.lines.map((line) => ({
      id: line.id,
      lineKind: line.lineKind,
      productId: line.productId,
      productLabel: line.product ? (line.product.productionLabel ?? line.product.name) + (line.size ? ` (${line.size})` : "") : "",
      rawProductText: line.rawProductText ?? "",
      size: line.size ?? "",
      qtyCurrent: line.qtyCurrent,
      urgency: line.urgency,
      requiredDate: line.requiredDate ? line.requiredDate.toISOString().slice(0, 10) : "",
      note: line.note ?? "",
    })),
  };

  const updateAction = updateCustomerPO.bind(null, po.id);

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref={`/production/orders/${po.id}`} />
      <h1 className="text-lg font-semibold mt-2 mb-1">แก้ไขออเดอร์</h1>
      <p className="text-sm text-gray-500 mb-4">
        การแก้ไขทุกครั้งจะถูกบันทึกเป็นประวัติ (Revision) — ไม่เขียนทับข้อมูลเดิม
      </p>
      <CustomerPOForm customers={customers} action={updateAction} initial={initial} />
    </div>
  );
}
