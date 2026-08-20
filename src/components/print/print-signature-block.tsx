// ข้อ 7.6-7.7 — Signature Section + Footer ขอบคุณ ใช้ร่วมกันได้ทุกประเภทเอกสาร
// (จำนวน/ชื่อช่องต่างกันได้ตาม fields prop เช่น Repair Note อาจไม่ต้องมี "ผู้มีอำนาจ
// อนุมัติ") "mt-auto" ดันลงไปชิดล่างเมื่ออยู่ใน container ที่เป็น flex column
// พร้อม min-height ตาม print profile (ดู globals.css .print-page-fill) — เป็นการ
// ประมาณด้วย CSS ยังต้องตรวจกับกระดาษจริงอีกครั้ง (Manual UAT)
export function PrintSignatureBlock({ fields }: { fields?: string[] }) {
  const labels = fields ?? ["ผู้รับสินค้า / Received By", "ผู้ส่งสินค้า / Sent By", "ผู้มีอำนาจอนุมัติ / Manager"];
  return (
    <div className="mt-auto pt-6 print:pt-4 break-inside-avoid">
      <div className="grid gap-4 text-center text-[10px]" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
        {labels.map((label) => (
          <div key={label}>
            <div className="border-t border-gray-400 pt-1">{label}</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
        ))}
      </div>
      <div className="text-center text-[9px] text-gray-500 mt-3">
        <div>ขอขอบคุณลูกค้าที่ไว้วางใจเรา</div>
        <div>Thank you for your trust and support.</div>
      </div>
    </div>
  );
}
