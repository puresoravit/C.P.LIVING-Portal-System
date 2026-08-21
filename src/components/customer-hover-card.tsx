"use client";

import { useState } from "react";

// Requirement ข้อ 3 (Dashboard): Hover ที่ลูกค้าแต่ละแถวต้องโชว์ Gross/Discount/Net/
// Quantity ของช่วงวันที่เดียวกับ Dashboard — ข้อมูลนี้มีอยู่แล้วใน metrics ที่ query
// มาพร้อม Top Customers ตั้งแต่ต้น (getDashboard) จึงรับเป็น prop ตรงๆ ไม่ยิง query
// ใหม่ตอน hover ตามที่ระบุไว้ชัดเจน
type HoverMetrics = { gross: number; discount: number; net: number; quantity: number };

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export function CustomerHoverCard({
  label,
  dateRangeLabel,
  metrics,
  children,
}: {
  label: string;
  dateRangeLabel: string;
  metrics: HoverMetrics;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);

  return (
    <li
      className="relative flex justify-between cursor-default"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute z-10 left-0 top-full mt-1 w-64 bg-white border rounded-lg shadow-lg p-3 text-xs">
          <div className="font-medium mb-0.5">{label}</div>
          <div className="text-gray-400 mb-2">{dateRangeLabel}</div>
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500">จำนวนเงิน / Amount</span>
            <span>{money(metrics.gross)} บาท</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500">Discount</span>
            <span>{money(metrics.discount)}</span>
          </div>
          <div className="flex justify-between py-0.5 font-medium border-t mt-0.5 pt-1">
            <span>Net Sales</span>
            <span>{money(metrics.net)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500">Quantity</span>
            <span>{metrics.quantity.toLocaleString("th-TH")} หน่วย</span>
          </div>
        </div>
      )}
    </li>
  );
}
