"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Smoke Test R8 (2026-08-25) — Owner ข้อ 2: Tab "วางบิลแล้ว" ต้องติ๊กเลือกได้อิสระเหมือน Tab
// "ยังไม่วางบิล" ไม่ใช่พิมพ์ซ้ำได้ทีละใบผ่านลิงก์เท่านั้น — ติ๊กเป็นระดับ Invoice (ตรงกับที่
// ตารางแสดง) แต่ "พิมพ์" จริงเป็นระดับใบวางบิล จึงต้องยุบ Invoice ที่ติ๊กให้เหลือ Billing
// Note ID ที่ไม่ซ้ำกันก่อนเข้าคิวพิมพ์ (Invoice หลายใบอาจอยู่ใบวางบิลเดียวกัน — พิมพ์ซ้ำ
// ใบเดิมไม่ได้) — React State ล้วน หลีกเลี่ยง Vanilla Script Sync Bug แบบเดียวกับ Tab แรก
//
// Smoke Test R9 (2026-08-25) — Owner: ป้าย Tab "วางบิลแล้ว" ทำให้เข้าใจผิดว่าเอกสารถูก
// "พิมพ์แล้ว" ทั้งที่จริง Invoice ย้ายมา Tab นี้ทันทีที่ถูกผูกกับใบวางบิลตอน *สร้าง* (ก่อน
// กดพิมพ์จริงด้วยซ้ำ) — เพิ่มคอลัมน์สถานะใบวางบิลจริง (ยังไม่พิมพ์/พิมพ์แล้ว/ยกเลิก — ใช้
// Badge สีเดียวกับหน้า List/Detail เดิมทุกประการ) + ส่วนลด/กลุ่ม ให้เห็นครบก่อนตัดสินใจ
// พิมพ์ซ้ำ (Owner: "เพราะคือการพิมพ์ใหม่ ให้ใช้เงื่อนไขเดียวกับข้อสอง")
const BN_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "ยังไม่พิมพ์", className: "bg-yellow-100 text-yellow-700" },
  PRINTED: { label: "พิมพ์แล้ว", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-500" },
};

export function BillingNoteBilledTable({
  invoices,
  backHref,
}: {
  invoices: {
    id: string;
    invoiceNumber: string;
    invoiceDateLabel: string;
    amount: number;
    groupLabel: string;
    billingNoteId: string;
    billingNoteNumber: string;
    billingNoteStatus: string;
    billingNoteApplyDiscount: boolean;
    printBackHref: string;
  }[];
  backHref: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const allChecked = invoices.length > 0 && checked.size === invoices.length;
  const total = invoices.reduce((s, inv) => s + inv.amount, 0);

  function toggleOne(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(invoices.map((i) => i.id)));
  }

  const pickedBillingNoteIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const inv of invoices) {
      if (!checked.has(inv.id) || seen.has(inv.billingNoteId)) continue;
      seen.add(inv.billingNoteId);
      ids.push(inv.billingNoteId);
    }
    return ids;
  }, [invoices, checked]);

  function handlePrintSelected() {
    if (pickedBillingNoteIds.length === 0) return;
    const params = new URLSearchParams();
    params.set("back", backHref);
    if (pickedBillingNoteIds.length > 1) params.set("queue", pickedBillingNoteIds.slice(1).join(","));
    router.push(`/billing-notes/${pickedBillingNoteIds[0]}/print?${params.toString()}`);
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-8 text-center text-gray-400 text-sm">ลูกค้ารายนี้ไม่มี Invoice ที่วางบิลแล้วในช่วงวันที่นี้</div>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 w-8">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} title="เลือกทั้งหมด" />
                </th>
                <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
                <th className="px-4 py-2 font-medium">วันที่</th>
                <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
                <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
                <th className="px-4 py-2 font-medium">ใบวางบิลที่ผูกอยู่</th>
                <th className="px-4 py-2 font-medium">สถานะใบวางบิล</th>
                <th className="px-4 py-2 font-medium">ส่วนลด</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const status = BN_STATUS_LABEL[inv.billingNoteStatus] ?? BN_STATUS_LABEL.CONFIRMED;
                return (
                  <tr key={inv.id} className="border-t">
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={checked.has(inv.id)} onChange={() => toggleOne(inv.id)} />
                    </td>
                    <td className="px-4 py-2 font-mono">
                      <a href={`/invoices/${inv.id}`} className="text-blue-600 hover:underline">
                        {inv.invoiceNumber}
                      </a>
                    </td>
                    <td className="px-4 py-2">{inv.invoiceDateLabel}</td>
                    <td className="px-4 py-2 text-gray-600">{inv.groupLabel}</td>
                    <td className="px-4 py-2 text-right">{inv.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2">
                      <a
                        href={`/billing-notes/${inv.billingNoteId}`}
                        className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 whitespace-nowrap"
                      >
                        {inv.billingNoteNumber}
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${status.className}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                      {inv.billingNoteApplyDiscount ? "ใช้ส่วนลด" : "ไม่ใช้ส่วนลด"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <a href={inv.printBackHref} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                        พิมพ์ซ้ำ
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium bg-gray-50">
                <td colSpan={4} className="px-4 py-2 text-right">
                  รวม ({invoices.length} ใบ)
                </td>
                <td className="px-4 py-2 text-right">{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handlePrintSelected}
          disabled={pickedBillingNoteIds.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2"
        >
          พิมพ์ใบวางบิลที่เลือก ({pickedBillingNoteIds.length} ใบ)
        </button>
        <span className="text-xs text-gray-500">
          ติ๊กเลือก Invoice ได้อิสระ — ถ้าหลาย Invoice อยู่ใบวางบิลเดียวกัน ระบบพิมพ์ใบนั้นครั้งเดียว
        </span>
      </div>
    </div>
  );
}
