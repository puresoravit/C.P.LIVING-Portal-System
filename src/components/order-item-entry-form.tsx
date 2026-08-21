"use client";

import { useState, useRef, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { ProductSearchPicker, type PickedProduct } from "@/components/product-search-picker";

// Phase R2.4 — เปลี่ยนจาก <form action={addAction}> (Native) เป็นเรียก addAction
// ตรงๆ ผ่าน useTransition เพื่ออ่าน ActionResult กลับมา — ถ้า order.status ไม่ใช่
// DRAFT แล้ว (เช่น เปิดค้างไว้หลายแท็บ แล้วอีกแท็บ Confirm ไปก่อน) จะได้ Toast แดงบอก
// เหตุผลแทนที่จะพังไป Error Boundary เหมือนก่อนหน้านี้ — ค่าที่พิมพ์ค้นหา/จำนวนไว้ไม่
// หายเพราะไม่มี Navigation เกิดขึ้นเลย (ต่างจาก key-remount ตอนสำเร็จซึ่งยังทำงานปกติ
// เพราะ parent คำนวณ key จาก order.items.length ที่อัปเดตจริงหลัง revalidatePath)
//
// R4 — Size Architecture Path A: ค้นหาสินค้าเปลี่ยนไปใช้ ProductSearchPicker ร่วมกัน
// (Model → เลือก Size / สินค้า Standalone) แทน Search ตรงๆ แบบเดิม — ที่เหลือ
// (จำนวน/รายละเอียด/Submit) เหมือนเดิมทุกประการ
export function OrderItemEntryForm({ addAction }: { addAction: (formData: FormData) => Promise<ActionResult> }) {
  const [selected, setSelected] = useState<PickedProduct | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const { showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);

  if (thrownError) throw thrownError;

  function pick(p: PickedProduct) {
    setSelected(p);
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  function handleQtyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // ฟอร์มนี้มีช่อง text หลายช่อง (ค้นหา/จำนวน/รายละเอียด) ทำให้ browser
    // ปิดการ submit-ด้วย-Enter-อัตโนมัติตาม HTML spec — ต้องดักเองเพื่อให้
    // ตรงตามที่ label ระบุไว้ "เลือกด้วยลูกศร/Enter" (ข้อ 60)
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await addAction(formData);
        if (!result.success) showError(result.error);
        // สำเร็จ: ไม่ต้องทำอะไรเพิ่ม — parent จะ remount component นี้เอง
        // ผ่าน key={order.items.length} หลัง revalidatePath ทำให้ฟอร์มล้างอัตโนมัติ
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  return (
    // key ที่ parent ใส่ไว้ (จำนวนรายการปัจจุบัน) จะทำให้ component นี้ remount
    // ทั้งชุดหลังเพิ่มรายการสำเร็จ ล้างฟอร์มให้อัตโนมัติ พร้อมคีย์รายการถัดไปทันที
    <form onSubmit={handleSubmit} className="flex gap-2 items-end bg-white border rounded-lg p-3">
      <input type="hidden" name="productId" value={selected?.id ?? ""} />
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          ค้นหารุ่นสินค้า/สินค้า (ชื่อรุ่น, รหัสสินค้า หรือชื่อ) — เลือกด้วยลูกศร/Enter
        </label>
        <ProductSearchPicker onPick={pick} autoFocus placeholder="เช่น M001 หรือ ที่นอนสปริง" />
      </div>
      <div className="w-28">
        <label className="block text-xs font-medium text-gray-600 mb-1">จำนวน</label>
        <input
          ref={qtyRef}
          name="quantity"
          type="number"
          step="0.01"
          min="0.01"
          required
          onKeyDown={handleQtyKeyDown}
          className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="w-44">
        <label className="block text-xs font-medium text-gray-600 mb-1">รายละเอียดเพิ่มเติม (ถ้ามี)</label>
        <input name="descriptionOverride" className="w-full border rounded px-3 py-1.5 text-sm" />
      </div>
      <button
        type="submit"
        disabled={!selected || isPending}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 h-[34px]"
      >
        {isPending ? "กำลังเพิ่ม..." : "+ เพิ่มรายการ"}
      </button>
    </form>
  );
}
