"use client";

import { useEffect, useMemo, useState } from "react";
import { createBillingNoteAction } from "@/app/(dashboard)/billing-notes/actions";

// Smoke Test R8 (2026-08-25) — เขียนใหม่เป็น React Client Component แทน Vanilla Script เดิม
// (ผ่านการแพตช์ทับกันมา 3 รอบจนเปราะ — Owner เจอบั๊กจริง: กด "เลือกทั้งหมด" แล้วแถวไม่ติ๊ก
// ตาม, ติ๊กเองแล้วปุ่มไม่เปิด) — State ทั้งหมด (ติ๊ก/ส่วนลด) อยู่ใน React ตรงๆ ไม่มี Manual
// DOM Query/addEventListener ให้หลุด Sync กันอีก — Sessionstorage ยังทำหน้าที่จำ State
// ข้ามหน้าเหมือนเดิม (Pattern เดียวกับ RememberDraft ของ Order/Quotation)

type EligibleInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDateLabel: string;
  amount: number;
  /** Smoke Test R9 — กลุ่มส่วนลดของ Invoice ใบนี้ (เชื่อมโยงสดจากชื่อปัจจุบัน) — ให้เห็น
   * ก่อนสร้างว่าจะถูกแยกใบวางบิลตามกลุ่มไหนบ้าง (ระบบแยกให้อัตโนมัติเสมอ ไม่ว่าจะติ๊ก
   * "ใช้ส่วนลด" หรือไม่ก็ตาม) */
  groupLabel: string;
};

const STATE_KEY = "cp-bn-new-state";

export function BillingNoteUnbilledSelector({
  invoices,
  customerId,
  billingNoteDate,
}: {
  invoices: EligibleInvoice[];
  customerId: string;
  billingNoteDate: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [applyDiscount, setApplyDiscount] = useState(false);

  // Restore เฉพาะตอน Mount แรกของหน้านี้ (URL เดียวกัน) — เหมือน RememberDraft/DraftResumeBanner
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.url !== location.pathname + location.search) return;
      const validIds = new Set(invoices.map((i) => i.id));
      setChecked(new Set((saved.checked as string[]).filter((id) => validIds.has(id))));
      if (saved.applyDiscount) setApplyDiscount(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    } catch {
      // ไม่มี sessionStorage (เช่น Private Mode บางเบราว์เซอร์) — เริ่มจาก State ว่าง ปกติ
    }
  }, []);

  // Save ทุกครั้งที่ State เปลี่ยน — ผูกกับ URL ปัจจุบันเสมอ
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          url: location.pathname + location.search,
          checked: [...checked],
          applyDiscount,
        })
      );
    } catch {
      // เหมือนด้านบน — ข้าม Feature นี้เฉยๆ ไม่กระทบการทำงานหลัก
    }
  }, [checked, applyDiscount]);

  const picked = useMemo(() => invoices.filter((inv) => checked.has(inv.id)), [invoices, checked]);
  const total = picked.reduce((s, inv) => s + inv.amount, 0);
  const allChecked = invoices.length > 0 && checked.size === invoices.length;

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

  function handleSubmit() {
    // สร้างสำเร็จแล้ว (Redirect ไปหน้าพิมพ์) — ล้าง State ค้างทิ้ง ถือว่าจบงานชุดนี้
    try {
      sessionStorage.removeItem(STATE_KEY);
    } catch {
      // ไม่มี sessionStorage — ไม่มีอะไรต้องล้าง
    }
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-8 text-center text-gray-400 text-sm">
          ลูกค้ารายนี้ไม่มี Invoice ที่พิมพ์แล้ว (9×11) และยังไม่ถูกวางบิลในช่วงวันที่นี้
        </div>
      </div>
    );
  }

  return (
    <form action={createBillingNoteAction} onSubmit={handleSubmit}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="billingNoteDate" value={billingNoteDate} />
      {picked.map((inv) => (
        <input key={inv.id} type="hidden" name="invoiceIds" value={inv.id} />
      ))}
      <input type="hidden" name="applyDiscount" value={applyDiscount ? "on" : ""} />

      <div className="bg-white border rounded-lg overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2">
                  {/* R7/R8 — เลือกทั้งหมดในคลิกเดียว (Owner: "ติ๊กได้หมด กับ เลือกเองได้ อย่างอิสระ") */}
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} title="เลือกทั้งหมด" />
                </th>
                <th className="px-4 py-2 font-medium">เลขที่ Invoice</th>
                <th className="px-4 py-2 font-medium">วันที่</th>
                <th className="px-4 py-2 font-medium">กลุ่มส่วนลด</th>
                <th className="px-4 py-2 font-medium text-right">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t">
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={checked.has(inv.id)} onChange={() => toggleOne(inv.id)} />
                  </td>
                  <td className="px-4 py-2 font-mono">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2">{inv.invoiceDateLabel}</td>
                  <td className="px-4 py-2 text-gray-600">{inv.groupLabel}</td>
                  <td className="px-4 py-2 text-right">{inv.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium bg-gray-50">
                <td colSpan={4} className="px-4 py-2 text-right">
                  สรุปยอดที่เลือก ({picked.length} ใบ)
                </td>
                <td className="px-4 py-2 text-right">{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        {/* Smoke Test (2026-08-25) — Owner: ใบส่งของส่วนใหญ่ออกราคาเต็ม แต่ใบวางบิลคือ
            เงินเก็บจริง จึงเลือกหักส่วนลดกลุ่มได้ตรงนี้ — ใบที่หักส่วนลดแล้วตอนออกใบ จะไม่
            ถูกหักซ้ำ (กติกาสำคัญที่ Owner ยืนยัน) */}
        <label className="flex items-center gap-2 text-sm bg-white border rounded-lg px-4 py-3">
          <input type="checkbox" checked={applyDiscount} onChange={(e) => setApplyDiscount(e.target.checked)} />
          <span>
            ใช้ส่วนลด (ตาม % กลุ่มส่วนลด / เงื่อนไขลูกค้า-สาขา ณ วันวางบิล)
            <span className="block text-xs text-gray-500">
              ใบที่หักส่วนลดแล้วตอนออกใบ จะไม่ถูกหักซ้ำ — ยอดส่วนลดแจงต่อใบในใบวางบิลหลังกดสร้าง —
              ไม่ว่าจะติ๊กหรือไม่ ระบบแยกใบวางบิลคนละเลขที่ตามกลุ่มส่วนลดในตารางด้านบนให้อัตโนมัติเสมอ
            </span>
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button
            disabled={picked.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2"
          >
            ✓ สร้างใบวางบิลจากรายการที่เลือก
          </button>
          {picked.length === 0 && <span className="text-xs text-gray-500">ติ๊กเลือก Invoice อย่างน้อย 1 ใบก่อนสร้างใบวางบิล</span>}
        </div>
      </div>
    </form>
  );
}
