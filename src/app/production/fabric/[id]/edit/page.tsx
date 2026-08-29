import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { displayMasterSpecName } from "@/lib/master-spec-import";
import { updateMasterSpec } from "../../actions";
import { MasterSpecEditForm, type MasterSpecEditInitial, type MasterSpecHeadOption } from "@/components/production/master-spec-edit-form";

// Master Spec edit (2026-08-29) — Admin เท่านั้น — key identity แสดง read-only แก้ไม่ได้
export default async function MasterSpecEditPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "productionMasterSpec.manage")) redirect("/production/fabric");

  const [spec, models, headProducts] = await Promise.all([
    db.productionMasterSpec.findUnique({
      where: { id: params.id },
      include: {
        fabrics: { orderBy: [{ placement: "asc" }, { seq: "asc" }] },
        layers: { orderBy: { seq: "asc" } },
      },
    }),
    db.productModel.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.product.findMany({
      where: { active: true, parentProductId: null, modelId: null },
      select: { id: true, name: true, productionLabel: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!spec) notFound();

  const headOptions: MasterSpecHeadOption[] = [
    ...models.map((m) => ({ value: `model:${m.id}`, label: `รุ่น: ${m.name}` })),
    ...headProducts.map((p) => ({ value: `product:${p.id}`, label: `สินค้า: ${p.productionLabel ?? p.name}` })),
  ];

  const initial: MasterSpecEditInitial = {
    head: spec.headKind && spec.headId ? `${spec.headKind}:${spec.headId}` : "",
    note: spec.note ?? "",
    approxThickness: spec.approxThickness ?? "",
    fabrics: spec.fabrics.map((f) => ({
      placement: f.placement,
      fabricName: f.fabricName,
      fabricCode: f.fabricCode ?? "",
      waddingWeight: f.waddingWeight ?? "",
      foamThickness: f.foamThickness ?? "",
      colorNote: f.colorNote ?? "",
      displayOverride: f.displayOverride ?? "",
      printVisible: f.printVisible,
    })),
    layers: spec.layers.map((l) => ({
      material: l.material,
      spec: l.layerSpec,
      displayOverride: l.displayOverride ?? "",
      printVisible: l.printVisible,
    })),
  };

  const updateAction = updateMasterSpec.bind(null, spec.id);

  return (
    <div className="max-w-2xl">
      <a href={`/production/fabric/${spec.id}`} className="text-sm text-blue-600 hover:underline">
        ← กลับไปดูสูตร
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">
        แก้ไข — {displayMasterSpecName({ specName: spec.specName, variant: spec.variant, thickness: spec.thickness, gussetCount: spec.gussetCount })}
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        ชื่อรุ่น/variant/ความหนา/กุ๊น เป็น identity ของสูตร แก้จากหน้านี้ไม่ได้ — แก้ได้: ผ้า โครงสร้าง
        ลำดับ การแสดงบนใบพิมพ์ และการผูกสินค้า
      </p>
      <MasterSpecEditForm initial={initial} headOptions={headOptions} action={updateAction} />
    </div>
  );
}
