import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { displayMasterSpecName } from "@/lib/master-spec-import";

// Master Spec detail (2026-08-29) — read-only: แสดง canonical เต็ม + เครื่องหมายแถวที่ไม่พิมพ์
// (printVisible=false ยังแสดงที่นี่เสมอ เพราะหน้านี้คือ canonical view ไม่ใช่ใบพิมพ์)
export default async function MasterSpecDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const canManage = can((session?.user as any)?.role, "productionMasterSpec.manage");

  const spec = await db.productionMasterSpec.findUnique({
    where: { id: params.id },
    include: {
      fabrics: { orderBy: [{ placement: "asc" }, { seq: "asc" }] },
      layers: { orderBy: { seq: "asc" } },
    },
  });
  if (!spec) notFound();

  let headName: string | null = null;
  if (spec.headKind === "model" && spec.headId) {
    headName = (await db.productModel.findUnique({ where: { id: spec.headId }, select: { name: true } }))?.name ?? null;
  } else if (spec.headKind === "product" && spec.headId) {
    const p = await db.product.findUnique({ where: { id: spec.headId }, select: { name: true, productionLabel: true } });
    headName = p ? p.productionLabel ?? p.name : null;
  }

  const samePlacementCount = (placement: string) => spec.fabrics.filter((f) => f.placement === placement).length;

  return (
    <div className="max-w-2xl">
      <a href="/production/fabric" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการสูตรผ้า / โครงสร้าง
      </a>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">
          {displayMasterSpecName({ specName: spec.specName, variant: spec.variant, thickness: spec.thickness, gussetCount: spec.gussetCount })}
        </h1>
        {canManage && (
          <a href={`/production/fabric/${spec.id}/edit`} className="text-xs px-2 py-0.5 rounded-full border border-blue-300 text-blue-700 hover:bg-blue-50">
            แก้ไข
          </a>
        )}
      </div>
      <div className="text-sm text-gray-500 mb-4">
        {headName ? (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">ผูกกับ: {headName}</span>
        ) : (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">ยังไม่ผูกสินค้า</span>
        )}
        {spec.approxThickness && <span className="ml-2">หนา ~{spec.approxThickness}&quot;</span>}
        {spec.titleRaw && <div className="text-xs text-gray-400 mt-1">ต้นฉบับ: {spec.titleRaw}</div>}
        {spec.note && <div className="text-xs text-gray-500 mt-1">หมายเหตุ: {spec.note}</div>}
      </div>

      <div className="bg-white border rounded-lg p-3 mb-3">
        <div className="text-sm font-medium text-gray-700 mb-1.5">ผ้า ({spec.fabrics.length})</div>
        <ul className="text-sm space-y-1">
          {spec.fabrics.map((f) => (
            <li key={f.id} className={f.printVisible ? "" : "text-gray-400"}>
              <span className="font-medium">
                {samePlacementCount(f.placement) > 1 ? `${f.placement} (${f.seq + 1})` : f.placement}
              </span>
              : {f.fabricName}
              {f.fabricCode && ` รหัส ${f.fabricCode}`}
              {f.waddingWeight && ` + ใย ${f.waddingWeight}`}
              {f.foamThickness && ` + ฟ.${f.foamThickness}`}
              {f.colorNote && ` (${f.colorNote})`}
              {f.displayOverride && <span className="text-xs text-blue-600 ml-1">[พิมพ์เป็น: {f.displayOverride}]</span>}
              {!f.printVisible && <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 ml-1.5">ไม่แสดงบนใบพิมพ์</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white border rounded-lg p-3">
        <div className="text-sm font-medium text-gray-700 mb-1.5">โครงสร้าง (บนลงล่าง) ({spec.layers.length})</div>
        <ol className="text-sm space-y-1 list-decimal list-inside">
          {spec.layers.map((l) => (
            <li key={l.id} className={l.printVisible ? "" : "text-gray-400"}>
              {l.material} {l.layerSpec}
              {l.displayOverride && <span className="text-xs text-blue-600 ml-1">[พิมพ์เป็น: {l.displayOverride}]</span>}
              {!l.printVisible && <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 ml-1.5">ไม่แสดงบนใบพิมพ์</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
