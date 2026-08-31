// ข้อ 7.6-7.7 — Signature Section + Footer ขอบคุณ ใช้ร่วมกันได้ทุกประเภทเอกสาร
// (จำนวน/ชื่อช่องต่างกันได้ตาม fields prop เช่น Repair Note อาจไม่ต้องมี "ผู้มีอำนาจ
// อนุมัติ") "mt-auto" ดันลงไปชิดล่างเมื่ออยู่ใน container ที่เป็น flex column
// พร้อม min-height ตาม print profile (ดู globals.css .print-page-fill) — เป็นการ
// ประมาณด้วย CSS ยังต้องตรวจกับกระดาษจริงอีกครั้ง (Manual UAT)
//
// R5 — ขนาด/ระยะห่างของ Section นี้ตรึงไว้คงเดิมทั้งหมด **ไม่ผูก** กับ
// bodyFontSize/headingFontSize/spacingDensity ใหม่โดยเจตนา เพราะเป็นจุดที่ชิดขอบ
// ล่างสุดของหน้ากระดาษ เสี่ยง Pagination สูงสุดถ้าโตขึ้น — เปิดให้ปรับได้แค่ข้อความ
// Footer ผ่าน footerNote (จำกัด 200 ตัวอักษรที่ฝั่ง Server) ไม่ใช่ขนาด/ระยะ
export function PrintSignatureBlock({
  fields,
  footerNote,
  fontScale = 1,
}: {
  fields?: string[];
  footerNote?: string;
  /** Owner UAT (2026-08-29/31) — ใบส่งของขยายฟอนต์รวม 30% แต่ Section นี้ตรึงขนาดคงที่
   * ไว้โดยเจตนา (เหตุผลเดิมข้างบน — R5) ทำให้เมื่อเทียบกับส่วนอื่นที่ขยายแล้วดูเล็กไม่
   * สมมาตร — เปิดเป็น Prop ให้เอกสารที่ต้องการปรับเรียกเองได้ (ไม่ส่ง = 1 = พฤติกรรม
   * เดิมทุกประการสำหรับเอกสารอื่นทั้ง 4 ประเภท) — ใช้ Inline Style (ชนะ text-[10px]
   * เดิมเสมอไม่ว่า Specificity เพราะเป็น Element Style) ไม่ต้องแก้ Class เดิมเลย */
  fontScale?: number;
}) {
  const labels = fields ?? ["ผู้รับสินค้า / Received By", "ผู้ส่งสินค้า / Sent By", "ผู้มีอำนาจอนุมัติ / Manager"];
  return (
    <div className="mt-auto pt-6 print:pt-4 break-inside-avoid">
      <div
        className="grid gap-4 text-center text-[10px]"
        style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))`, fontSize: `${10 * fontScale}px` }}
      >
        {labels.map((label) => (
          <div key={label}>
            {/* Owner UAT (2026-08-31) — เส้นขีดรองรับลายเซ็นจางไม่ชัด (สาเหตุเดียวกับ
                เส้นขีดตารางที่แก้ไปแล้ว — border-gray-400 ยังจางไปสำหรับกระดาษจริง) */}
            <div className="border-t border-gray-800 pt-1">{label}</div>
            <div className="mt-1">วันที่ ____/____/____</div>
          </div>
        ))}
      </div>
      <div
        className="text-center text-[9px] text-gray-500 mt-3"
        style={{ whiteSpace: "pre-line", fontSize: `${9 * fontScale}px` }}
      >
        {footerNote || "ขอขอบคุณลูกค้าที่ไว้วางใจเรา\nThank you for your trust and support."}
      </div>
    </div>
  );
}
