import { db } from "@/lib/db";
import { notFound } from "next/navigation";

const DATE_MODE_LABEL: Record<string, string> = {
  UNSET: "ยังไม่กำหนด",
  ESTIMATE: "ประมาณ",
  EXACT: "ระบุชัด",
};

// Checkpoint 1 (S2) — หน้าดูอย่างเดียว ยังไม่มีแก้ไข/Revision ในรอบนี้ (Checkpoint 2)
export default async function CustomerPODetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const po = await db.customerPO.findUnique({
    where: { id: params.id },
    include: {
      customer: { select: { companyName: true, code: true } },
      branch: { select: { name: true } },
      lines: { include: { product: { select: { name: true, sku: true, productionLabel: true } } }, orderBy: { id: "asc" } },
    },
  });
  if (!po) notFound();

  return (
    <div className="max-w-2xl">
      <a href="/production/orders" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการออเดอร์ลูกค้า
      </a>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-lg font-semibold">
          {po.customer.companyName}
          {po.urgency && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 align-middle">ด่วน</span>}
        </h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{po.status}</span>
      </div>

      <div className="bg-white border rounded-lg p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">สาขา</div>
          <div>{po.branch?.name ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">สั่งครั้งที่</div>
          <div>{po.orderSeqNo ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">วันที่ต้องการ</div>
          <div>
            {DATE_MODE_LABEL[po.dateMode] ?? po.dateMode}
            {po.requestedDate && ` (${po.requestedDate.toLocaleDateString("th-TH")})`}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">สร้างเมื่อ</div>
          <div>{po.createdAt.toLocaleDateString("th-TH")}</div>
        </div>
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">รายการ ({po.lines.length})</h2>
      <div className="space-y-2">
        {po.lines.map((line) => (
          <div key={line.id} className="bg-white border rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">
                  {/* Architecture (2026-08-28) — identity กลางคือ productId (Product ตัวเดียว
                      ใช้ร่วมกับ Billing) ชื่อที่แสดงในหน้าจอ Production ใช้ productionLabel
                      ก่อนเสมอ fallback เป็น name เมื่อยังไม่มีค่า (ยังไม่มีข้อมูลจริงตอนนี้ —
                      รอเจ้าของส่งมา) — ไม่ใช่ text-mapping ข้ามระบบ แค่ override การแสดงผล
                      บน Product เดียวกัน */}
                  {line.lineKind === "CATALOG" ? (line.product?.productionLabel ?? line.product?.name ?? "—") : line.rawProductText}
                  {line.lineKind === "UNRESOLVED" && (
                    <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">ยังไม่มีในระบบ</span>
                  )}
                </div>
                {line.product?.sku && <div className="text-xs text-gray-400 font-mono">{line.product.sku}</div>}
                {line.size && <div className="text-xs text-gray-500 mt-0.5">ไซส์ {line.size}</div>}
                {/* วันที่เฉพาะรายการ = override เฉพาะบรรทัดด่วน (ปกติ inherit จาก P.O. ด้านบน
                    อยู่แล้ว ไม่ต้องแสดงซ้ำ) */}
                {line.requiredDate && (
                  <div className="text-xs text-red-600 mt-0.5">ต้องการวันที่ {line.requiredDate.toLocaleDateString("th-TH")} (เฉพาะรายการนี้)</div>
                )}
                {line.note && <div className="text-xs text-gray-500 mt-0.5">หมายเหตุ: {line.note}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-semibold">{line.qtyCurrent}</div>
                {line.urgency && <div className="text-xs text-red-600">ด่วน</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
