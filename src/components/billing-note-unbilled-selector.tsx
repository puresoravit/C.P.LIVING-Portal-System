"use client";

import { useEffect, useMemo, useState } from "react";
import { createBillingNoteAction } from "@/app/(dashboard)/billing-notes/actions";

// Smoke Test R8 (2026-08-25) — เขียนใหม่เป็น React Client Component แทน Vanilla Script เดิม
// (ผ่านการแพตช์ทับกันมา 3 รอบจนเปราะ — Owner เจอบั๊กจริง: กด "เลือกทั้งหมด" แล้วแถวไม่ติ๊ก
// ตาม, ติ๊กเองแล้วปุ่มไม่เปิด) — State ทั้งหมด (ติ๊ก/ส่วนลด) อยู่ใน React ตรงๆ
//
// Smoke Test R10 (2026-08-25) — เพิ่มตามที่ Owner มาร์คแดง + ยืนยัน Semantic:
// - คอลัมน์ "% ส่วนลด" ต่อใบ (Preview จาก Resolver ตัวเดียวกับตอนสร้างจริง — Server คำนวณ)
// - สรุปยอดหักส่วนลดให้เห็นล่วงหน้าเมื่อติ๊ก "ใช้ส่วนลด" (ยอดเต็ม − ส่วนลด = สุทธิ)
// - ใบที่ค้างอยู่ในใบวางบิลที่ "ยังไม่ยืนยันพิมพ์" แสดงในตารางนี้ (ไม่หายไปไหน) แต่ติ๊กซ้ำ
//   ไม่ได้ — มี Badge ลิงก์ไปใบวางบิลนั้น (กดยกเลิกที่นั่นได้ = Invoice ปลดกลับมาทันที)
// - หลังสร้างใบสำเร็จ จำหน้า (ลูกค้า/ช่วงวันที่) ไว้เหมือนเดิม ล้างเฉพาะรายการที่ติ๊ก

type EligibleInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDateLabel: string;
  amount: number;
  /** กลุ่มส่วนลดของ Invoice ใบนี้ (เชื่อมโยงสดจากชื่อปัจจุบัน) */
  groupLabel: string;
  /** % ส่วนลดที่จะได้จริงถ้าติ๊กใช้ส่วนลด (Preview ณ วันนี้ — 0 = ไม่มี) */
  discountPct: number;
  /** จำนวนเงินส่วนลดของใบนี้ (คู่กับ discountPct) */
  discountAmount: number;
  /** true = หักส่วนลดไปแล้วตอนออกใบ (ไม่หักซ้ำ) */
  alreadyDiscounted: boolean;
  /** มีค่า = ใบนี้ค้างอยู่ในใบวางบิลที่ยังไม่ยืนยันพิมพ์ — ติ๊กซ้ำไม่ได้ */
  pendingNoteId: string | null;
  pendingNoteNumber: string | null;
};

const STATE_KEY = "cp-bn-new-state";

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

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

  const selectable = useMemo(() => invoices.filter((inv) => !inv.pendingNoteId), [invoices]);

  // Restore เฉพาะตอน Mount แรกของหน้านี้ (URL เดียวกัน)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.url !== location.pathname + location.search) return;
      const validIds = new Set(selectable.map((i) => i.id));
      setChecked(new Set(((saved.checked ?? []) as string[]).filter((id) => validIds.has(id))));
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

  const picked = useMemo(() => selectable.filter((inv) => checked.has(inv.id)), [selectable, checked]);
  const grossTotal = picked.reduce((s, inv) => s + inv.amount, 0);
  const discountTotal = picked.reduce((s, inv) => s + inv.discountAmount, 0);
  const netTotal = grossTotal - discountTotal;
  const allChecked = selectable.length > 0 && checked.size === selectable.length;

  function toggleOne(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(selectable.map((i) => i.id)));
  }

  function handleSubmit() {
    // R10 — สร้างสำเร็จ (กำลัง Redirect ไปหน้าพิมพ์): ล้างเฉพาะรายการที่ติ๊ก แต่จำหน้า
    // (ลูกค้า/ช่วงวันที่) ไว้ — กดเมนูใบวางบิลรอบหน้ายังเด้งกลับมาหน้าลูกค้ารายนี้เหมือนเดิม
    try {
      sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({ url: location.pathname + location.search, checked: [], applyDiscount: false })
      );
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
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} title="เลือกทั้งหมด" />
                </th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">เลขที่ Invoice</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">วันที่</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">กลุ่มส่วนลด</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap text-right">% ส่วนลด</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap text-right">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const pending = !!inv.pendingNoteId;
                return (
                  <tr key={inv.id} className={`border-t ${pending ? "bg-gray-50 text-gray-400" : ""}`}>
                    <td className="px-4 py-2">
                      {!pending && <input type="checkbox" checked={checked.has(inv.id)} onChange={() => toggleOne(inv.id)} />}
                    </td>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{inv.invoiceDateLabel}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {inv.groupLabel}
                      {pending && (
                        <a
                          href={`/billing-notes/${inv.pendingNoteId}`}
                          className="ml-2 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 hover:bg-yellow-200 whitespace-nowrap"
                          title="ใบนี้อยู่ในใบวางบิลที่ยังไม่ยืนยันพิมพ์ — กดเพื่อไปพิมพ์/ยกเลิก"
                        >
                          ค้างใน {inv.pendingNoteNumber} (ยังไม่พิมพ์)
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      {pending ? (
                        "—"
                      ) : inv.alreadyDiscounted ? (
                        <span className="text-xs text-gray-400">หักแล้วตอนออกใบ</span>
                      ) : inv.discountPct > 0 ? (
                        `${inv.discountPct}%`
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">{money(inv.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium bg-gray-50">
                <td colSpan={5} className="px-4 py-2 text-right">
                  สรุปยอดที่เลือก ({picked.length} ใบ)
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{money(grossTotal)}</td>
              </tr>
              {/* R10 — Owner มาร์คแดง: ติ๊กใช้ส่วนลดแล้วต้องเห็นยอดหักล่วงหน้าเลย */}
              {applyDiscount && picked.length > 0 && (
                <>
                  <tr className="bg-gray-50 text-red-600">
                    <td colSpan={5} className="px-4 py-1 text-right">
                      ส่วนลดรวม
                    </td>
                    <td className="px-4 py-1 text-right whitespace-nowrap">-{money(discountTotal)}</td>
                  </tr>
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={5} className="px-4 py-2 text-right">
                      ยอดสุทธิหลังหักส่วนลด
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">{money(netTotal)}</td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm bg-white border rounded-lg px-4 py-3">
          <input type="checkbox" checked={applyDiscount} onChange={(e) => setApplyDiscount(e.target.checked)} />
          <span>
            ใช้ส่วนลด (ตาม % กลุ่มส่วนลด / เงื่อนไขลูกค้า-สาขา ณ วันวางบิล)
            <span className="block text-xs text-gray-500">
              ไม่ติ๊ก = แสดงจำนวนเงินเต็ม / ติ๊ก = แจงส่วนลดต่อใบและหักจากยอดเรียกเก็บจริง (ใบที่หักส่วนลดแล้วตอนออกใบ ไม่ถูกหักซ้ำ) —
              ระบบแยกใบวางบิลคนละเลขที่ตามกลุ่มส่วนลดให้อัตโนมัติเสมอ
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
