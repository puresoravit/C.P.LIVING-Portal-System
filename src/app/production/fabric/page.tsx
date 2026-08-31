import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { displayMasterSpecName } from "@/lib/master-spec-import";

// Master Spec batch (2026-08-29) — แทน stub เดิม: รายการ Production Master Spec (สูตรผ้า/
// โครงสร้างต้นแบบต่อรุ่น) — สถานะ "ยังไม่ผูกสินค้า" derive จาก headId null (ไม่มีคอลัมน์
// สถานะแยก) ผูก/แก้รายรุ่นผ่าน UI เป็นงานรอบถัดไป รอบนี้ list + import ก่อน
export default async function FabricMasterSpecPage() {
  const session = await getServerSession(authOptions);
  const canManage = can((session?.user as any)?.role, "productionMasterSpec.manage");

  const specs = await db.productionMasterSpec.findMany({
    orderBy: [{ specName: "asc" }, { variant: "asc" }, { thickness: "asc" }],
    include: { _count: { select: { fabrics: true, layers: true } } },
  });

  // headKind/headId ไม่มี FK relation (polymorphic) — ดึงชื่อ head แยก
  const modelIds = specs.filter((s) => s.headKind === "model" && s.headId).map((s) => s.headId as string);
  const productIds = specs.filter((s) => s.headKind === "product" && s.headId).map((s) => s.headId as string);
  const [models, products] = await Promise.all([
    modelIds.length ? db.productModel.findMany({ where: { id: { in: modelIds } }, select: { id: true, name: true } }) : [],
    productIds.length ? db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, productionLabel: true } }) : [],
  ]);
  const headNameByKey = new Map<string, string>([
    ...models.map((m) => [`model:${m.id}`, m.name] as [string, string]),
    ...products.map((p) => [`product:${p.id}`, p.productionLabel ?? p.name] as [string, string]),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">สูตรผ้า / โครงสร้าง (Master Spec)</h1>
        {canManage && (
          <a href="/production/fabric/import" className="bg-cp-navy hover:bg-cp-navy-light text-white text-sm font-medium rounded-lg px-4 py-2">
            นำเข้าจาก Excel
          </a>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        สูตรต้นแบบต่อรุ่น ใช้ prefill ตอนสร้างใบสั่งผลิต — ใบที่ Confirm แล้วเป็น snapshot อิสระ
        แก้สูตรที่นี่ไม่กระทบใบเก่า
      </p>

      {specs.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-6 text-sm text-gray-500">
          ยังไม่มี Master Spec — {canManage ? "เริ่มจากปุ่ม “นำเข้าจาก Excel” ด้านบน" : "รอผู้ดูแลระบบนำเข้าข้อมูล"}
        </div>
      ) : (
        <div className="space-y-2">
          {specs.map((spec) => {
            const headName = spec.headKind && spec.headId ? headNameByKey.get(`${spec.headKind}:${spec.headId}`) : null;
            return (
              <a key={spec.id} href={`/production/fabric/${spec.id}`} className="block bg-white border rounded-lg p-3 hover:border-cp-navy sm:flex sm:items-center sm:justify-between sm:gap-3">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {displayMasterSpecName({ specName: spec.specName, variant: spec.variant, thickness: spec.thickness, gussetCount: spec.gussetCount })}
                  </span>
                  {headName ? (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">ผูกกับ: {headName}</span>
                  ) : (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">ยังไม่ผูกสินค้า</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1 sm:mt-0">
                  ผ้า {spec._count.fabrics} · โครงสร้าง {spec._count.layers} ชั้น
                  {spec.approxThickness && ` · หนา ~${spec.approxThickness}"`}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
