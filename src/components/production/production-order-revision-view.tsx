import { groupItemsBySpecHash } from "@/lib/production-item-grouping";

// S3 CP2/CP3 — Render รายการผลิตของ 1 Revision แบบจัดกลุ่มตาม specHash ("Production Block")
// ใช้ร่วมกันทั้งหน้า detail (Revision ปัจจุบัน) และหน้าดู Revision เก่า (CP3 reconstruct) —
// ไม่ใช่ Client Component เพราะไม่มี interaction ใดๆ แค่แสดงผลจากข้อมูลที่ Server ดึงมาให้แล้ว
export type RevisionViewFabric = {
  id: string;
  placement: string;
  seq: number;
  fabricName: string;
  fabricCode: string | null;
  waddingWeight: string | null;
  foamThickness: string | null;
  colorNote: string | null;
  displayOverride: string | null;
  printVisible: boolean;
};

export type RevisionViewLayer = {
  id: string;
  seq: number;
  material: string;
  spec: string;
  displayOverride: string | null;
  printVisible: boolean;
};

export type RevisionViewItem = {
  id: string;
  specHash: string;
  qty: number;
  size: string | null;
  gussetCount: number | null;
  thickness: string | null;
  note: string | null;
  productionLabelSnapshot: string | null;
  nameSnapshot: string | null;
  skuSnapshot: string | null;
  customerPoLineId: string | null;
  fabrics: RevisionViewFabric[];
  layers: RevisionViewLayer[];
};

/** แสดง "(1)/(2)" ต่อท้าย placement เฉพาะเมื่อมีมากกว่า 1 ผ้าในกลุ่มเดียวกัน (เช่น Cerina
 * SIDE #1/#2) — เพื่อความชัดเจนว่าเป็นคนละแถวจริง ไม่ใช่แสดงซ้ำโดยบังเอิญ ไม่ใช่การบอกว่า
 * ลำดับนี้ถูกยืนยันทางธุรกิจ (ดู production-spec-hash.ts) */
function fabricPlacementLabel(fabric: RevisionViewFabric, allFabrics: RevisionViewFabric[]): string {
  const samePlacementCount = allFabrics.filter((f) => f.placement === fabric.placement).length;
  return samePlacementCount > 1 ? `${fabric.placement} (${fabric.seq + 1})` : fabric.placement;
}

export function ProductionOrderRevisionView({ items, customerPoId }: { items: RevisionViewItem[]; customerPoId: string }) {
  const groups = groupItemsBySpecHash(items);

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.specHash} className="bg-white border rounded-lg p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{group.representative.productionLabelSnapshot ?? group.representative.nameSnapshot ?? "—"}</div>
              {group.representative.skuSnapshot && <div className="text-xs text-gray-400 font-mono">{group.representative.skuSnapshot}</div>}
            </div>
            <div className="text-lg font-semibold shrink-0">{group.totalQty}</div>
          </div>

          {/* รายการไซส์ในกลุ่มนี้ — สเปกร่วมกันทุกไซส์ (specHash เดียวกัน) แสดงแค่ครั้งเดียวข้างล่าง
              note ไม่เข้า specHash จึงต่างกันได้ต่อไซส์แม้สเปกเดียวกัน — แสดงแยกต่อไซส์เสมอ
              ไม่ยุบเหลือแค่ note ของตัวแทนกลุ่ม (จะทำให้ note ของไซส์อื่นหายไปเงียบๆ) */}
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((item) => (
              <span key={item.id} className="text-xs bg-gray-100 rounded px-2 py-0.5">
                {item.size ? `ไซส์ ${item.size}` : "ไม่ระบุไซส์"} × {item.qty}
                {item.customerPoLineId && (
                  <a href={`/production/orders/${customerPoId}`} className="ml-1 text-blue-600 hover:underline">
                    (ต้นทาง)
                  </a>
                )}
                {item.note && <span className="text-gray-500"> — {item.note}</span>}
              </span>
            ))}
          </div>

          <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
            {group.representative.gussetCount != null && <span>กุ๊น {group.representative.gussetCount}</span>}
            {group.representative.thickness && <span>ความหนา {group.representative.thickness}</span>}
            <span className="font-mono text-gray-300" title="spec_hash">
              {group.specHash.slice(0, 12)}
            </span>
          </div>

          <div className="text-xs">
            <div className="text-gray-500 mb-0.5">ผ้า</div>
            <ul className="space-y-0.5">
              {group.representative.fabrics.map((f) => (
                <li key={f.id}>
                  <span className="font-medium">{fabricPlacementLabel(f, group.representative.fabrics)}</span>: {f.displayOverride ?? f.fabricName}
                  {f.waddingWeight && ` + ใย ${f.waddingWeight}`}
                  {f.foamThickness && ` + ฟ.${f.foamThickness}`}
                  {f.colorNote && ` (${f.colorNote})`}
                  {!f.printVisible && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">ไม่พิมพ์</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="text-xs">
            <div className="text-gray-500 mb-0.5">โครงสร้าง (บนลงล่าง)</div>
            <ol className="list-decimal list-inside space-y-0.5">
              {group.representative.layers.map((l) => (
                <li key={l.id}>
                  {l.displayOverride ?? `${l.material} ${l.spec}`}
                  {!l.printVisible && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">ไม่พิมพ์</span>}
                </li>
              ))}
            </ol>
          </div>

        </div>
      ))}
    </div>
  );
}
