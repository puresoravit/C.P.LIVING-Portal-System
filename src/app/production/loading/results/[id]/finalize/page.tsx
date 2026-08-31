// CP7 round 13 — Route alias เดียวกับ ../page.tsx (ดู comment ที่นั่น) — ให้ "บันทึกผล
// ขึ้นของ" ส่วนรอบันทึกผลลิงก์มาที่นี่แทน /production/loading/[id]/finalize ตรงๆ เพื่อให้
// Prefix-match เมนูถูกฝั่งเอง ไม่ต้องมี Regex Alias
export { default } from "../../../[id]/finalize/page";
