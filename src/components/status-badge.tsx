// Status Badge — Shared UI แทนที่ STATUS_LABEL map + span ที่เคยเขียนซ้ำใน 5 หน้ารายการ
// เอกสาร แต่ละหน้ายังกำหนด config label/สีเองอยู่ดี (เพราะ Status ที่รองรับจริงไม่เหมือนกัน
// ทุกประเภท — component นี้แค่ render ตาม config ที่ส่งมา)
export type StatusBadgeConfig = Record<string, { label: string; className: string }>;

export function StatusBadge({ status, config }: { status: string; config: StatusBadgeConfig }) {
  const entry = config[status] ?? { label: status, className: "bg-gray-100 text-gray-500" };
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${entry.className}`}>{entry.label}</span>;
}
