// ข้อ 7.3 — Customer/Document Information แบ่งซ้าย-ขวา + Shipping Address แถวเดียว
// (wrap เฉพาะยาวเกิน) รับ field เป็น prop เพราะแต่ละประเภทเอกสารมีข้อมูลไม่เหมือนกัน
// (Order ไม่มี Tax ID ลูกค้า, Invoice/Tax Invoice มี ฯลฯ) — Shared แค่ Layout ไม่บังคับ
// ว่าต้องมี field อะไรบ้าง
export function PrintCustomerInfo({
  left,
  right,
  shippingAddress,
}: {
  left: { label: string; value: React.ReactNode }[];
  right: { label: string; value: React.ReactNode }[];
  shippingAddress?: string | null;
}) {
  return (
    <div className="border-t border-b py-1.5 mb-1.5 text-xs">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-0.5">
          {left.map((row, i) => (
            <div key={i}>
              <span className="text-gray-500">{row.label}:</span> {row.value}
            </div>
          ))}
        </div>
        <div className="text-right space-y-0.5">
          {right.map((row, i) => (
            <div key={i}>
              <span className="text-gray-500">{row.label}:</span> {row.value}
            </div>
          ))}
        </div>
      </div>
      {shippingAddress && (
        <div className="mt-1">
          <span className="text-gray-500">สถานที่ส่งสินค้า / Shipping Address:</span> {shippingAddress}
        </div>
      )}
    </div>
  );
}
