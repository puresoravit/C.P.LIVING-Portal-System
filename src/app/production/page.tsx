import { db } from "@/lib/db";

// Dashboard Shell (S1, redesign S4 UAT round 5 ตาม mockup ของ Owner) — ยังเป็นโครง
// ไม่ผูก business logic จริง ไม่ query DB (ตัวเลข/ข้อความแจ้งเตือนจะเริ่มมีความหมายเมื่อ
// Sprint ที่เกี่ยวข้องเสร็จ) — การ์ดโทนสีอ่อนตามประเภทการแจ้งเตือน + ไอคอนประกอบ
// mobile-first: 2 คอลัมน์บนจอแคบ → 5 คอลัมน์บนจอกว้าง กรอบขนาดพอดี เผื่อพื้นที่
// ข้อความแจ้งเตือนในอนาคต

type StatusCard = {
  label: string;
  hint: string;
  tone: string; // พื้น/ขอบการ์ด
  chipTone: string; // ป้ายไอคอนมุมบน
  icon: React.ReactNode;
  future?: boolean; // ยังไม่มี sprint รองรับ
  live?: boolean; // CP4 — การ์ดที่เปิดข้อมูลจริงแล้ว (กดเข้าได้)
};

function Icon({ path, className }: { path: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? "w-4 h-4"} aria-hidden>
      {path}
    </svg>
  );
}

const ICONS = {
  alarm: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 10v3l2 2M5 3 2.5 5.5M19 3l2.5 2.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M12 14v3l2 1" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  docRefresh: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 13h5M10 17h5" />
    </>
  ),
  truck: (
    <>
      <path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z" />
      <circle cx="6" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2M9 11l2 2 4-4" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3h10v5M5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2z" />
      <path d="M7 16h10" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
} as const;

// S4 UAT round 6 — Owner: ป้ายไอคอนมุมบนให้เติมพื้นหลังเป็นสีของตัวเองเลย (ไม่ใช่พื้นขาว
// ขอบสี) ให้ดูมีมิติมากขึ้น เข้ากับโทนของการ์ด
const STATUS_CARDS: StatusCard[] = [
  {
    label: "ด่วนวันนี้",
    hint: "งานที่ต้องเร่งหรือปิดภายในวันนี้",
    tone: "bg-red-50/70 border-red-200",
    chipTone: "bg-red-600 text-white border-red-600",
    icon: ICONS.alarm,
  },
  {
    label: "ใกล้ครบกำหนด",
    hint: "งานที่ควรเร่งติดตามใน 1–3 วัน",
    tone: "bg-amber-50/70 border-amber-200",
    chipTone: "bg-amber-500 text-white border-amber-500",
    icon: ICONS.calendar,
  },
  {
    label: "กำลังผลิต",
    hint: "รายการที่อยู่ระหว่างการผลิต",
    tone: "bg-green-50/70 border-green-200",
    chipTone: "bg-green-600 text-white border-green-600",
    icon: ICONS.gear,
  },
  {
    label: "มีการอัปเดตล่าสุด",
    hint: "รายการที่เพิ่งมีการแก้ไขหรือยืนยัน",
    tone: "bg-blue-50/70 border-blue-200",
    chipTone: "bg-blue-600 text-white border-blue-600",
    icon: ICONS.docRefresh,
  },
  {
    label: "ของค้างส่ง",
    hint: "งานที่รอจัดส่งหรือยังปิดไม่ครบ",
    tone: "bg-gray-50 border-gray-200",
    chipTone: "bg-gray-400 text-white border-gray-400",
    icon: ICONS.truck,
    live: true, // CP4 — การ์ดเดียวที่เปิด query จริงตาม approval
  },
];

type QuickAction = {
  label: string;
  hint: string;
  href: string;
  iconTone: string;
  icon: React.ReactNode;
};

const QUICK_ACTIONS: QuickAction[] = [
  { label: "เพิ่มออเดอร์ลูกค้า", hint: "สร้างและบันทึกออเดอร์จากลูกค้า", href: "/production/orders/new", iconTone: "bg-blue-600", icon: ICONS.clipboard },
  { label: "ออก/พิมพ์ใบสั่งผลิต", hint: "สร้างหรือพิมพ์ใบสั่งผลิต", href: "/production/production-orders", iconTone: "bg-green-600", icon: ICONS.printer },
  { label: "ทำใบขึ้นของ", hint: "บันทึกรายการขึ้นของ (Phase P2)", href: "/production/loading", iconTone: "bg-violet-600", icon: ICONS.upload },
];

export default async function ProductionHomePage() {
  // CP4 — Owner อนุมัติเปิด query จริง "เฉพาะการ์ดของค้างส่ง" (การ์ดอื่นยังเป็น placeholder
  // ตาม scope เดิม): นับบัตรเปิด + ยอดชิ้นคงเหลือรวม (derive จาก ledger)
  const openCards = await db.outstandingDelivery.findMany({
    where: { closedAt: null },
    select: { qtyOriginal: true, allocations: { select: { qty: true } } },
  });
  const outstandingCount = openCards.length;
  const outstandingPieces = openCards.reduce((s, c) => s + c.qtyOriginal - c.allocations.reduce((x, a) => x + a.qty, 0), 0);

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-1">ภาพรวม</h1>
      <p className="text-sm text-gray-500 mb-6">
        Production &amp; Delivery — ระยะ P1 โครงกระดูก (คีย์มือล้วน ยังไม่มี AI) หน้านี้เป็นโครง Dashboard
        เตรียมไว้ก่อน ตัวเลขจะเริ่มมีความหมายจริงเมื่อ Sprint ที่เกี่ยวข้องเสร็จแล้ว
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 mb-8">
        {STATUS_CARDS.map((card) => {
          const inner = (
            <>
              <span className={`inline-flex items-center gap-1.5 self-start border rounded-full px-2 py-1 text-[11px] font-medium ${card.chipTone}`}>
                <Icon path={card.icon} className="w-3.5 h-3.5" />
                {card.label}
              </span>
              <div className="mt-3 sm:mt-4">
                <div className="text-sm sm:text-base font-semibold text-gray-800">{card.label}</div>
                {card.live ? (
                  <div className="text-xs sm:text-sm mt-1 leading-snug">
                    <span className="font-semibold text-gray-800">{outstandingCount} รายการ</span>
                    <span className="text-gray-500"> · เหลือ {outstandingPieces} ชิ้น</span>
                  </div>
                ) : (
                  <div className="text-[11px] sm:text-xs text-gray-500 mt-1 leading-snug">{card.hint}</div>
                )}
              </div>
              <div className="flex-1 flex items-end justify-center pb-1 text-current opacity-25">
                <Icon path={card.icon} className="w-10 h-10 sm:w-12 sm:h-12" />
              </div>
            </>
          );
          const cls = `border rounded-2xl p-3 sm:p-4 flex flex-col min-h-[10rem] sm:min-h-[13rem] ${card.tone} ${card.future ? "border-dashed" : ""}`;
          return card.live ? (
            <a key={card.label} href="/production/outstanding" className={`${cls} hover:border-gray-400`}>
              {inner}
            </a>
          ) : (
            <div key={card.label} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">ทางลัด</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {QUICK_ACTIONS.map((action) => (
          <a
            key={action.label}
            href={action.href}
            className="flex items-center gap-3 bg-white border rounded-xl p-3.5 hover:border-cp-navy"
          >
            <span className={`shrink-0 w-10 h-10 rounded-lg text-white flex items-center justify-center ${action.iconTone}`}>
              <Icon path={action.icon} className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-gray-900">{action.label}</span>
              <span className="block text-xs text-gray-500 truncate">{action.hint}</span>
            </span>
            <span className="text-gray-300" aria-hidden>›</span>
          </a>
        ))}
      </div>
    </div>
  );
}
