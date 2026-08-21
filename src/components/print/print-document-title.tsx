// ข้อ 7.2 — ชื่อเอกสารไทย/อังกฤษ 2 บรรทัดติดกัน กึ่งกลาง Pattern เดียวกันทุกประเภท
// เอกสาร เปลี่ยนแค่ข้อความตาม Document Type ที่เรียกใช้
//
// R5 — titleTh ใช้ --print-heading-size (เดิม text-sm=14px), titleEn ใช้
// --print-body-size (เดิม text-xs=12px) รักษาสัดส่วนสัมพัทธ์เดิมไว้เป๊ะที่ Default
export function PrintDocumentTitle({ titleTh, titleEn }: { titleTh: string; titleEn: string }) {
  return (
    <div className="text-center mb-1.5">
      <div className="font-semibold text-[length:var(--print-heading-size)] leading-tight">{titleTh}</div>
      <div className="text-[length:var(--print-body-size)] text-gray-700 leading-tight">{titleEn}</div>
    </div>
  );
}
