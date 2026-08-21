// แปลง object ของ searchParams (ที่อาจมี undefined ปนอยู่) ให้เป็น Record<string,string>
// ล้วนๆ สำหรับส่งเข้า URLSearchParams — ใช้ร่วมกันได้ทุกหน้าที่มี Filter/Tab/Pagination
// (เดิมมี pattern เดียวกันซ้ำในไฟล์เดียวคือ reports/page.tsx เป็น local function)
export function toQueryObject<T extends Record<string, string | undefined>>(sp: T): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (value) out[key] = value;
  }
  return out;
}
