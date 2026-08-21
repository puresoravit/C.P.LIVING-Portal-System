import type { MonthlySalesPoint } from "@/lib/reports";

// Phase R1 — Monthly Sales Chart: Bar Chart แบบ SVG ล้วน ไม่เพิ่ม Dependency ใหม่
// (ตรวจ package.json แล้วไม่มี Chart Library อยู่เดิม ระบบนี้คุม Dependency ให้น้อย
// ที่สุดมาตลอด) เป็น Server Component ธรรมดา ไม่มี Interactivity ในตัวกราฟเอง — ตัวเลข
// แสดงเป็น Label เหนือแท่งเสมอ (ไม่ใช้ Hover Tooltip) เพื่อให้อ่านง่ายบน Mobile ที่ไม่มี
// Hover ด้วย — Responsive ผ่าน viewBox (SVG ปรับตามความกว้าง Container อัตโนมัติ)
function money(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export function MonthlySalesChart({ data }: { data: MonthlySalesPoint[] }) {
  const width = 700;
  const height = 260;
  const paddingLeft = 8;
  const paddingRight = 8;
  const paddingTop = 28;
  const paddingBottom = 28;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const barGap = 8;
  const barWidth = (chartWidth - barGap * (data.length - 1)) / data.length;

  const maxNet = Math.max(...data.map((d) => d.net), 1); // กัน Divide by Zero ถ้าทุกเดือนเป็น 0

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[500px]" role="img" aria-label="กราฟยอดขายรายเดือน">
        {/* เส้น Baseline */}
        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#e5e7eb" />
        {data.map((point, i) => {
          const barHeight = maxNet > 0 ? (point.net / maxNet) * chartHeight : 0;
          const x = paddingLeft + i * (barWidth + barGap);
          const y = height - paddingBottom - barHeight;
          return (
            <g key={point.month}>
              {point.net > 0 && (
                <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="10" fill="#374151">
                  {money(point.net)}
                </text>
              )}
              <rect
                x={x}
                y={point.net > 0 ? y : height - paddingBottom - 1}
                width={barWidth}
                height={point.net > 0 ? barHeight : 1}
                rx={2}
                fill={point.net > 0 ? "#2563eb" : "#e5e7eb"}
              />
              <text x={x + barWidth / 2} y={height - paddingBottom + 16} textAnchor="middle" fontSize="11" fill="#6b7280">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
