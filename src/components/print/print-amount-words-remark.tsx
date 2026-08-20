// ข้อ 6.7/7.5 — "ตัวอักษร / Amount in Words" + "หมายเหตุ / Remark" ฝั่งซ้ายของกรอบ
// สรุปยอด ใช้ Layout เดียวกันได้ทุกประเภทเอกสาร (remark เป็น optional เพราะบางประเภท
// เอกสารไม่มี field หมายเหตุอยู่จริง เช่น Invoice/Tax Invoice — แสดง label เปล่าไว้
// ตามฟอร์มอ้างอิง ไม่ใช่การเพิ่มข้อมูลใหม่)
export function PrintAmountWordsRemark({ amountInWords, remark }: { amountInWords: string; remark?: string | null }) {
  return (
    <div className="text-xs space-y-1">
      <div>
        <span className="text-gray-500">ตัวอักษร / Amount in Words:</span> {amountInWords}
      </div>
      <div>
        <span className="text-gray-500">หมายเหตุ / Remark:</span> {remark || ""}
      </div>
    </div>
  );
}
