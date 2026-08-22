"use client";

import type { UnresolvedSizeInfo } from "@/components/product-search-picker";

// R6 Phase B — ช่องกรอก Size/ราคาเองสำหรับ Order/Quotation เมื่อเลือก Size ที่ยังไม่มี
// Product จริงรองรับ (Standard Size ที่ยังไม่ตั้งราคาต่อฟุต หรือ "ขนาดพิเศษ/ระบุเอง") —
// ถ้ารุ่นนี้ไม่มี Product จริงเหลืออยู่เลย (anchorProductId=null) จะบล็อกไปเลยเพราะ
// OrderItem/QuotationItem.productId เป็น Required FK เสมอ (Schema Constraint จริง ไม่ใช่
// Policy) — Billing Staff ที่ไม่มีสิทธิ์ product.edit จะไม่เห็นลิงก์ไปหน้าตั้งราคา
// (กันไม่ให้กดแล้วเจอ FORBIDDEN)
export function SizeOverrideFields({
  info,
  sizeText,
  price,
  onSizeTextChange,
  onPriceChange,
  canManageProducts,
}: {
  info: UnresolvedSizeInfo;
  sizeText: string;
  price: string;
  onSizeTextChange: (v: string) => void;
  onPriceChange: (v: string) => void;
  canManageProducts: boolean;
}) {
  if (!info.anchorProductId) {
    return (
      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        รุ่น &quot;{info.modelName}&quot; ยังไม่มีสินค้าในระบบเลย ต้องตั้งราคาต่อฟุตหรือเพิ่มไซส์ก่อนจึงจะคีย์เอกสารได้{" "}
        {canManageProducts ? (
          <a href={`/product-models/${info.modelId}`} target="_blank" rel="noopener noreferrer" className="underline font-medium">
            ไปตั้งค่าที่หน้ารุ่นสินค้า
          </a>
        ) : (
          "กรุณาติดต่อผู้ดูแลระบบ"
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-end">
      <div className="w-32">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {info.custom ? "ขนาดพิเศษ *" : "ขนาด"}
        </label>
        <input
          value={sizeText}
          onChange={(e) => onSizeTextChange(e.target.value)}
          placeholder={info.custom ? "เช่น 4.2 เมตร" : info.size}
          className="w-full border rounded px-3 py-1.5 text-sm"
        />
      </div>
      <div className="w-28">
        <label className="block text-xs font-medium text-gray-600 mb-1">ราคา/หน่วย *</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          className="w-full border rounded px-3 py-1.5 text-sm"
        />
      </div>
      {!info.custom && (
        <p className="text-xs text-amber-700 flex-1 pb-1.5">
          ไซส์มาตรฐานนี้ยังไม่มีในระบบ — ราคาที่กรอกใช้เฉพาะรายการนี้ ไม่บันทึกเป็นราคามาตรฐาน
        </p>
      )}
    </div>
  );
}
