import type { MonthlySalesPoint } from "@/lib/reports";
import { CHART_COLORS } from "@/lib/chart-colors";

// Phase R1 — Monthly Sales Chart: Bar Chart แบบ SVG ล้วน ไม่เพิ่ม Dependency ใหม่
// (ตรวจ package.json แล้วไม่มี Chart Library อยู่เดิม ระบบนี้คุม Dependency ให้น้อย
// ที่สุดมาตลอด) เป็น Server Component ธรรมดา ไม่มี Interactivity ในตัวกราฟเอง — ตัวเลข
// แสดงเป็น Label เหนือแท่งเสมอ (ไม่ใช้ Hover Tooltip) เพื่อให้อ่านง่ายบน Mobile ที่ไม่มี
// Hover ด้วย — Responsive ผ่าน viewBox (SVG ปรับตามความกว้าง Container อัตโนมัติ)
//
// Dashboard Chart Redesign — ลดความสูง/Padding ให้ Compact ขึ้นสำหรับวางคู่กับ
// Sales Growth แบบ 50/50 (เดิมสูง 260 เต็มความกว้าง Dashboard คนเดียว) — Data/Query
// เดิมทุกประการ ไม่แตะ Sales SOT, สีย้ายไปใช้ CHART_COLORS กลางแทน Hardcode Hex
function money(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export function MonthlySalesChart({ data }: { data: MonthlySalesPoint[] }) {
  const width = 500;
  const height = 200;
  const paddingLeft = 6;
  const paddingRight = 6;
  const paddingTop = 24;
  const paddingBottom = 22;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const barGap = 6;
  const barWidth = (chartWidth - barGap * (data.length - 1)) / data.length;

  const maxNet = Math.max(...data.map((d) => d.net), 1); // กัน Divide by Zero ถ้าทุกเดือนเป็น 0

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[360px]" role="img" aria-label="กราฟยอดขายรายเดือน">
        {/* เส้น Baseline */}
        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke={CHART_COLORS.axisLine} />
        {data.map((point, i) => {
          const barHeight = maxNet > 0 ? (point.net / maxNet) * chartHeight : 0;
          const x = paddingLeft + i * (barWidth + barGap);
          const y = height - paddingBottom - barHeight;
          return (
            <g key={point.month}>
              {point.net > 0 && (
                <text x={x + barWidth / 2} y={y - 5} textAnchor="middle" fontSize="9" fill={CHART_COLORS.labelDark}>
                  {money(point.net)}
                </text>
              )}
              <rect
                x={x}
                y={point.net > 0 ? y : height - paddingBottom - 1}
                width={barWidth}
                height={point.net > 0 ? barHeight : 1}
                rx={2}
                fill={point.net > 0 ? CHART_COLORS.barDefault : CHART_COLORS.barEmpty}
              />
              <text x={x + barWidth / 2} y={height - paddingBottom + 14} textAnchor="middle" fontSize="9" fill={CHART_COLORS.labelMuted}>
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
