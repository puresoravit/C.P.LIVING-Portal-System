// Dashboard Shell (S1) — วางโครง IA ระยะยาวไว้ก่อน ไม่ผูก business logic จริง
// การ์ดสถานะทั้งหมดเป็นค่าคงที่ (placeholder) โดยเจตนา ไม่ query DB — เพราะ workflow
// ที่จะสร้างข้อมูลจริง (CustomerPO/ProductionOrder/Loading) ยังไม่มีจนกว่าจะถึง
// Sprint S2 เป็นต้นไป ห้ามดึง scope ของ sprint ถัดไปมาทำก่อนเวลา

type StatusCard = {
  label: string;
  hint: string;
  dotColor: string; // จุดสีบอกประเภทสถานะให้พนักงานกวาดตาแยกได้เร็ว
  future?: boolean; // true = ยังไม่มีแม้แต่ sprint รองรับตอนนี้ (รอ P2)
};

const STATUS_CARDS: StatusCard[] = [
  { label: "ต้องดำเนินการวันนี้", hint: "จะเริ่มนับหลัง Sprint S2 (ออเดอร์ลูกค้า)", dotColor: "bg-red-500" },
  { label: "ใกล้ถึงกำหนดส่ง", hint: "จะเริ่มนับหลัง Sprint S2", dotColor: "bg-yellow-400" },
  { label: "กำลังผลิต", hint: "จะเริ่มนับหลัง Sprint S3–S4 (ใบสั่งผลิต)", dotColor: "bg-green-500" },
  { label: "มีการอัปเดตล่าสุด", hint: "จะเริ่มนับหลัง Sprint S5 (ประวัติ)", dotColor: "bg-sky-500" },
  { label: "ของค้างส่ง", hint: "เป็นงานของ Phase P2", dotColor: "bg-gray-900", future: true },
];

type QuickAction = {
  label: string;
  hint: string;
  href: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { label: "รับ P.O. ลูกค้า", hint: "Sprint S2", href: "/production/orders" },
  { label: "ออก/พิมพ์ใบสั่งผลิต", hint: "Sprint S3–S4", href: "/production/production-orders" },
  { label: "ทำใบขึ้นของ", hint: "Phase P2", href: "/production/loading" },
];

export default function ProductionHomePage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">ภาพรวม</h1>
      <p className="text-sm text-gray-500 mb-6">
        Production &amp; Delivery — ระยะ P1 โครงกระดูก (คีย์มือล้วน ยังไม่มี AI) หน้านี้เป็นโครง Dashboard
        เตรียมไว้ก่อน ตัวเลขจะเริ่มมีความหมายจริงเมื่อ Sprint ที่เกี่ยวข้องเสร็จแล้ว
      </p>

      {/* การ์ดสี่เหลี่ยมจัตุรัส (aspect-square) + จุดสีมุมขวาบนบอกประเภทสถานะ — มือถือ:
          กระชับ (padding เล็ก, ซ่อนคำอธิบายรอง) เพราะจอแคบเห็นสถานะคร่าวๆ ก็พอ — จาก sm
          ขึ้นไปแสดงเต็มเหมือนเดิม ไม่กระทบเดสก์ท็อป */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-8">
        {STATUS_CARDS.map((card) => (
          <div
            key={card.label}
            className={`relative aspect-square bg-white border rounded-xl shadow-sm p-2.5 sm:p-4 flex flex-col items-center justify-center text-center ${
              card.future ? "border-dashed" : ""
            }`}
          >
            <span
              className={`absolute top-2.5 right-2.5 sm:top-3 sm:right-3 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${card.dotColor}`}
              aria-hidden
            />
            <div className="text-lg sm:text-2xl font-semibold text-gray-300">—</div>
            <div className="text-[11px] sm:text-xs font-medium text-gray-700 mt-0.5 sm:mt-1">{card.label}</div>
            <div className="hidden sm:block text-[11px] text-gray-400 mt-1">{card.hint}</div>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-3">ทางลัด</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {QUICK_ACTIONS.map((action) => (
          <a
            key={action.href}
            href={action.href}
            className="block bg-white border rounded-lg p-4 hover:border-cp-navy transition-colors"
          >
            <div className="text-sm font-medium mb-1">{action.label}</div>
            <span className="inline-flex items-center gap-1.5 text-[11px] tracking-wide text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
              ยังไม่เปิดใช้งาน · {action.hint}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
