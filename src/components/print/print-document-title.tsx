// ข้อ 7.2 — ชื่อเอกสารไทย/อังกฤษ 2 บรรทัดติดกัน กึ่งกลาง Pattern เดียวกันทุกประเภท
// เอกสาร เปลี่ยนแค่ข้อความตาม Document Type ที่เรียกใช้
export function PrintDocumentTitle({ titleTh, titleEn }: { titleTh: string; titleEn: string }) {
  return (
    <div className="text-center mb-1.5">
      <div className="font-semibold text-sm leading-tight">{titleTh}</div>
      <div className="text-xs text-gray-700 leading-tight">{titleEn}</div>
    </div>
  );
}
