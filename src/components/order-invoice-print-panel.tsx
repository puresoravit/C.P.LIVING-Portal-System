"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// ==========================================================================
// Owner UAT Fix — Order → Multiple Invoice Printing: Order หนึ่งแตก Invoice หลายใบ
// (ตามกลุ่มส่วนลด) เดิมพนักงานต้องไล่เปิดพิมพ์ทีละใบผ่าน Invoice Center — Panel นี้ให้
// เลือกใบที่ต้องการ (บางใบ/Select All) แล้วเข้า Print Flow เดิมของ Invoice แบบเรียงคิว
// (Controlled Sequential Queue) — ตั้งใจไม่เปิด Print Dialog หลายใบพร้อมกัน เพราะ Browser
// Popup Blocking ทำให้ไม่เสถียร และผู้ใช้คุมจังหวะป้อนกระดาษต่อเนื่อง 9×11 ต่อใบไม่ได้
//
// กลไกคิว: ส่งผ่าน Query String ล้วนๆ ไม่มี Client State ข้ามหน้า —
//   /invoices/{first}/print?back=/orders/{orderId}&queue={id2},{id3}
// หน้า Print (Server Component) อ่าน back/queue → แสดงปุ่ม "พิมพ์ใบถัดไป" เอง — Refresh/
// เปิด Tab ใหม่กลางคิวได้โดยคิวไม่หาย (อยู่ใน URL) — ไม่มี Calculation/Snapshot Path ใหม่
// ใดๆ ทุกใบใช้หน้า Print + markInvoicePrinted (9×11 Rule) เดิมของตัวเองทุกประการ
// ==========================================================================

export type PrintableInvoiceRow = {
  id: string;
  invoiceNumber: string;
  // Owner (2026-09-02) — Physical Sheet: ป้ายช่วงเลขแผ่นเมื่อใบมีหลายแผ่น (null = ใบเดียว/แผ่นเดียว)
  sheetRangeLabel?: string | null;
  /** ป้ายกลุ่มส่วนลด (displayProductTypeCode ฝั่ง Server) */
  typeLabel: string;
  /** ยอดเงิน Format แล้วจาก Server (เลี่ยงส่ง Decimal ข้าม Boundary) */
  amountLabel: string;
  status: string;
  printedAtLabel: string | null;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยังไม่พิมพ์", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-green-50 text-green-700 border-green-200" },
  CANCELLED: { label: "ยกเลิกแล้ว", className: "bg-gray-100 text-gray-400 border-gray-200" },
};

export function OrderInvoicePrintPanel({ orderId, invoices }: { orderId: string; invoices: PrintableInvoiceRow[] }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // ใบที่ยกเลิกแล้วพิมพ์ไม่ได้ (markInvoicePrinted ฝั่ง Server ก็ Throw อยู่แล้ว) — แสดง
  // ในรายการเพื่อความครบถ้วนแต่เลือกไม่ได้ — ใบ PRINTED แล้วยังเลือก Reprint ได้ (พิมพ์ซ้ำ
  // ได้เสมอ แค่ mark ซ้ำไม่ได้ — Server กัน Double-count ให้เอง status เป็น PRINTED ไปแล้ว)
  const selectable = useMemo(() => invoices.filter((inv) => inv.status !== "CANCELLED"), [invoices]);
  const allSelected = selectable.length > 0 && selectable.every((inv) => checked.has(inv.id));

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allSelected ? new Set() : new Set(selectable.map((inv) => inv.id)));
  }

  function printSelected() {
    // รักษาลำดับตามรายการที่แสดง (ลำดับเดียวกับที่แตกจาก Order) ไม่ใช่ลำดับการติ้ก
    const queue = selectable.filter((inv) => checked.has(inv.id)).map((inv) => inv.id);
    if (queue.length === 0) return;
    const [first, ...rest] = queue;
    const params = new URLSearchParams({ back: `/orders/${orderId}` });
    if (rest.length > 0) params.set("queue", rest.join(","));
    router.push(`/invoices/${first}/print?${params.toString()}`);
  }

  const selectedCount = selectable.filter((inv) => checked.has(inv.id)).length;

  return (
    <div className="bg-white border rounded-lg p-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="font-medium text-sm">Invoice ที่แตกจาก Order นี้</h2>
        {selectable.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              เลือกทั้งหมด
            </label>
            <button
              type="button"
              onClick={printSelected}
              disabled={selectedCount === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium rounded px-3 py-1.5 whitespace-nowrap"
            >
              พิมพ์ที่เลือก / Print Invoices{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
          </div>
        )}
      </div>
      <ul className="text-sm divide-y">
        {invoices.map((inv) => {
          const badge = STATUS_BADGE[inv.status] ?? { label: inv.status, className: "bg-gray-50 text-gray-500 border-gray-200" };
          const cancelled = inv.status === "CANCELLED";
          return (
            <li key={inv.id} className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={checked.has(inv.id)}
                onChange={() => toggle(inv.id)}
                disabled={cancelled}
                aria-label={`เลือก ${inv.invoiceNumber}`}
              />
              {/* Owner UAT (2026-09-02) — ตัวอักษรประเภท (A/B/C) ต้องติดเลขที่เหมือนเดิม —
                  ช่วงเลขแผ่นเป็นบรรทัดย่อยใต้เลข ไม่ดันตำแหน่งเพื่อนร่วมแถว */}
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <a href={`/invoices/${inv.id}`} className={`font-mono hover:underline ${cancelled ? "text-gray-400" : "text-blue-600"}`}>
                    {inv.invoiceNumber}
                  </a>
                  <span className="text-gray-500 text-xs">{inv.typeLabel}</span>
                </div>
                {inv.sheetRangeLabel && (
                  <div className="text-xs text-gray-500 font-mono">{inv.sheetRangeLabel}</div>
                )}
              </div>
              <span className={`ml-auto text-right ${cancelled ? "text-gray-400" : ""}`}>{inv.amountLabel} บาท</span>
              <span
                className={`text-[11px] border rounded-full px-2 py-0.5 whitespace-nowrap ${badge.className}`}
                title={inv.printedAtLabel ? `พิมพ์เมื่อ ${inv.printedAtLabel}` : undefined}
              >
                {badge.label}
                {inv.status === "PRINTED" && inv.printedAtLabel ? ` · ${inv.printedAtLabel}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
