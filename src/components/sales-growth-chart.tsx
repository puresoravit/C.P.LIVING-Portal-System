import type { SalesGrowthPoint } from "@/lib/reports";
import { CHART_COLORS } from "@/lib/chart-colors";

// Dashboard Chart Redesign — Sales Growth (MoM %) Bar Chart แบบ SVG ล้วน เหมือน
// MonthlySalesChart (ไม่เพิ่ม Dependency ใหม่) — ต่างจากกราฟยอดขายตรงที่เป็น
// Bidirectional (แท่งขึ้น = บวก สีเขียว, แท่งลง = ลบ สีแดง) รอบเส้นกลาง (0%)
// kind "flat" (เดือนก่อน=0, เดือนนี้=0) แสดงเป็นขีดสั้นๆ ตรงเส้นกลาง สีเทา
// kind "new" (เดือนก่อน=0, เดือนนี้>0 — คำนวณ % ไม่ได้ ห้ามหาร 0/Infinity) แสดง
// เป็น "ใหม่" แทนตัวเลข % ไม่ใช่ปั้นเลขขึ้นมาเอง
function formatPct(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function SalesGrowthChart({ data }: { data: SalesGrowthPoint[] }) {
  const width = 500;
  const height = 200;
  const paddingLeft = 6;
  const paddingRight = 6;
  const paddingTop = 20;
  const paddingBottom = 22;
  const chartWidth = width - paddingLeft - paddingRight;
  const midY = paddingTop + (height - paddingTop - paddingBottom) / 2;
  const halfHeight = (height - paddingTop - paddingBottom) / 2 - 12; // เผื่อที่ให้ Label ตัวเลข
  const barGap = 6;
  const barWidth = (chartWidth - barGap * (data.length - 1)) / data.length;

  const maxAbsPct = Math.max(...data.filter((d) => d.kind === "pct").map((d) => Math.abs(d.value)), 1);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[360px]" role="img" aria-label="กราฟการเติบโตของยอดขายเทียบเดือนก่อนหน้า">
        {/* เส้นกลาง 0% */}
        <line x1={paddingLeft} y1={midY} x2={width - paddingRight} y2={midY} stroke={CHART_COLORS.axisLine} />
        {data.map((point, i) => {
          const x = paddingLeft + i * (barWidth + barGap);

          if (point.kind === "flat") {
            return (
              <g key={point.month}>
                <text x={x + barWidth / 2} y={midY - 6} textAnchor="middle" fontSize="9" fill={CHART_COLORS.neutral}>
                  0%
                </text>
                <rect x={x} y={midY - 1} width={barWidth} height={2} rx={1} fill={CHART_COLORS.neutral} />
                <text x={x + barWidth / 2} y={height - paddingBottom + 14} textAnchor="middle" fontSize="9" fill={CHART_COLORS.labelMuted}>
                  {point.label}
                </text>
              </g>
            );
          }

          if (point.kind === "new") {
            return (
              <g key={point.month}>
                <text x={x + barWidth / 2} y={midY - 6} textAnchor="middle" fontSize="9" fill={CHART_COLORS.neutral}>
                  ใหม่
                </text>
                <rect x={x} y={midY - 1} width={barWidth} height={2} rx={1} fill={CHART_COLORS.neutral} />
                <text x={x + barWidth / 2} y={height - paddingBottom + 14} textAnchor="middle" fontSize="9" fill={CHART_COLORS.labelMuted}>
                  {point.label}
                </text>
              </g>
            );
          }

          const isPositive = point.value >= 0;
          const barHeight = maxAbsPct > 0 ? (Math.abs(point.value) / maxAbsPct) * halfHeight : 0;
          const barY = isPositive ? midY - barHeight : midY;
          const labelY = isPositive ? barY - 5 : barY + barHeight + 12;
          const color = isPositive ? CHART_COLORS.positive : CHART_COLORS.negative;

          return (
            <g key={point.month}>
              <text x={x + barWidth / 2} y={labelY} textAnchor="middle" fontSize="9" fill={color}>
                {formatPct(point.value)}
              </text>
              <rect x={x} y={barY} width={barWidth} height={Math.max(barHeight, 1)} rx={2} fill={color} />
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
