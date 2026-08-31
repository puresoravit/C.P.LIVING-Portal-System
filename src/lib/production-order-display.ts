// S3 CP1 — เหมือน displayQuotationNumber ใน running-number.ts เป๊ะ (แปะ suffix ตอนแสดงผล
// เท่านั้น ไม่กระทบข้อมูล/เลขที่เอกสารจริง)
export function displayProdNo(prodNo: string, revNo: number): string {
  return revNo > 0 ? `${prodNo}-${revNo}` : prodNo;
}
