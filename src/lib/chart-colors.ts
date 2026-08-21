// Dashboard Chart Redesign — Chart Color Constants กลาง ใช้ร่วมกันทุกกราฟ SVG ในระบบ
// (Monthly Sales, Sales Growth ฯลฯ) กันสี Hardcode กระจายอยู่คนละไฟล์ — ค่าตรงกับ
// Tailwind Palette ที่ระบบใช้อยู่แล้วทั้งระบบ (blue-600/green-600/red-600/gray-*)
export const CHART_COLORS = {
  barDefault: "#2563eb", // blue-600 — แท่งกราฟยอดขายปกติ
  barEmpty: "#e5e7eb", // gray-200 — เดือนที่ไม่มียอด
  axisLine: "#e5e7eb", // gray-200
  labelDark: "#374151", // gray-700 — ตัวเลขเหนือแท่ง
  labelMuted: "#6b7280", // gray-500 — ป้ายแกน X
  positive: "#16a34a", // green-600 — Sales Growth เป็นบวก
  negative: "#dc2626", // red-600 — Sales Growth เป็นลบ
  neutral: "#9ca3af", // gray-400 — Growth = 0% หรือเดือนที่ยังไม่มีข้อมูลเทียบ (ใหม่/N/A)
} as const;
