"use client";

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

type BranchOption = { id: string; name: string };
type CustomerOption = { id: string; code: string; companyName: string; branches: BranchOption[] };

// Owner UAT (2026-08-31) — "เปลี่ยนบริษัท/สาขา": พนักงานเลือกลูกค้าผิดตั้งแต่แรก บาง
// ครั้งกว่าจะรู้ตัวก็พิมพ์เอกสารออกไปแล้ว — Owner ยืนยันให้แก้ได้แม้หลัง Confirm/พิมพ์แล้ว
// โดยไม่ต้องรื้อรายการสินค้าที่คีย์ไว้แล้ว — Modal นี้ใช้ได้ทั้ง Order ร่างและ Confirmed
// แล้ว (isConfirmed คุมว่าต้องโชว์คำเตือน+ติ๊ก Acknowledge หรือไม่ — ร่างไม่มี Invoice เลย
// ไม่ต้องเตือนอะไร) — โครง Modal/Pattern ก็อปจาก OrderEditModal ทุกประการเพื่อความสม่ำเสมอ
export function ChangeOrderCustomerModal({
  orderNumber,
  customers,
  currentCustomerId,
  currentBranchId,
  isConfirmed,
  requiresPrintedAck,
  action,
}: {
  orderNumber: string;
  customers: CustomerOption[];
  currentCustomerId: string;
  currentBranchId: string | null;
  /** true = Order Confirmed แล้ว (มี Invoice อาจพิมพ์ไปแล้ว) — false = ยังเป็นร่าง */
  isConfirmed: boolean;
  /** มีใบ Active สถานะ PRINTED อยู่ — ต้องติ๊ก Acknowledge ก่อนถึงจะบันทึกได้ */
  requiresPrintedAck: boolean;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [customerId, setCustomerId] = useState(currentCustomerId);
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [acknowledgePrinted, setAcknowledgePrinted] = useState(false);
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;
    setCustomerId(currentCustomerId);
    setBranchId(currentBranchId ?? "");
    setAcknowledgePrinted(false);
  }, [isOpen, currentCustomerId, currentBranchId]);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const hasChanged = customerId !== currentCustomerId || (branchId || null) !== currentBranchId;
  const canSubmit = !!customerId && hasChanged && (!requiresPrintedAck || acknowledgePrinted) && !isPending;

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    setBranchId(""); // ลูกค้าเปลี่ยน — สาขาเดิมใช้ไม่ได้แล้วแน่ๆ ล้างทิ้งเสมอ
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const formData = new FormData();
    formData.set("customerId", customerId);
    formData.set("branchId", branchId);
    formData.set("acknowledgePrinted", acknowledgePrinted ? "1" : "0");
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        showSuccess(result.message ?? "เปลี่ยนบริษัท/สาขาเรียบร้อย");
        setIsOpen(false);
      } else {
        showError(result.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm text-gray-700 hover:text-blue-600 border rounded px-4 py-2"
      >
        เปลี่ยนบริษัท/สาขา
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">เปลี่ยนบริษัท/สาขา — {orderNumber}</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
                ×
              </button>
            </div>

            <div className="p-4 space-y-4">
              {isConfirmed && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  Order นี้ยืนยันแล้ว — เปลี่ยนบริษัท/สาขาจะแก้ข้อมูลลูกค้าในใบส่งของเลขเดิม
                  (ไม่ออกเลขใหม่) รายการสินค้าเดิมทั้งหมดยังคงอยู่ ราคา/ส่วนลดจะคำนวณใหม่ตาม
                  เงื่อนไขของบริษัทที่เลือก
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า *</label>
                <select
                  value={customerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">สาขา (ถ้ามี)</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                  disabled={!selectedCustomer || selectedCustomer.branches.length === 0}
                >
                  <option value="">
                    {selectedCustomer && selectedCustomer.branches.length === 0 ? "ลูกค้ารายนี้ยังไม่มีสาขา" : "— ไม่ระบุสาขา —"}
                  </option>
                  {selectedCustomer?.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {requiresPrintedAck && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-2">
                  <div>
                    <b>คำเตือน:</b> เอกสารบางใบของ Order นี้ถูก<b>พิมพ์ไปแล้ว</b> — ข้อมูลลูกค้า/สาขา
                    ในระบบของใบนั้นจะถูกแก้เป็นข้อมูลใหม่ทันที (เลขที่และสถานะพิมพ์แล้วคงเดิม) แต่
                    รายการ/ยอดของใบพิมพ์แล้วจะ<b>คงเดิม</b> — ถ้าราคาตามลูกค้าใหม่ทำให้ยอดใบนั้นต้องเปลี่ยน
                    ระบบจะไม่ให้บันทึก (ต้องยกเลิกใบนั้นแล้วออกใหม่) กระดาษที่พิมพ์ไว้ต้องแก้/พิมพ์ใหม่เอง
                  </div>
                  <label className="flex items-center gap-2 font-medium">
                    <input type="checkbox" checked={acknowledgePrinted} onChange={(e) => setAcknowledgePrinted(e.target.checked)} />
                    ฉันรับทราบว่าข้อมูลของใบที่เคยพิมพ์แล้วจะถูกแก้ไขโดยใช้เลขที่เดิม
                  </label>
                </div>
              )}
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => setIsOpen(false)} className="text-sm border rounded px-4 py-2 hover:bg-gray-50">
                ยกเลิก
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded px-4 py-2"
              >
                {isPending ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
