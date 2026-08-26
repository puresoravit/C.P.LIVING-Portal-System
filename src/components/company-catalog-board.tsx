"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";

// ==========================================================================
// R9.1 (2026-08-26) — Company Catalog Board: การ์ดบริษัทบนหน้า "สินค้า — เลือกบริษัท"
// พร้อมโหมดรวมกลุ่มแบบ Drag & Drop (ลากการ์ด A ไปทับ B = A มาใช้กลุ่มของ B) —
// การตัดสินเคสจริง (เพิ่ม/ย้าย/รวมทั้งกลุ่ม) อยู่ฝั่ง Server ทั้งหมด (mergeCompanyGroups
// → moveCompanyIntoGroup) — Client แค่แสดง Confirm ที่บรรยายเคสจากข้อมูลที่ Render มา
// แล้วเรียก Action เดียว — Mobile/ไม่ถนัดลาก: ปุ่ม "รวมกลุ่มกับ… ▾" บนการ์ดทำงานเดียวกัน
// (และหน้าบริษัทยังมี Panel เพิ่ม/ถอดสมาชิกแบบปุ่มเหมือนเดิมเป็นอีกทาง)
// ==========================================================================

export type CompanyCard = {
  id: string;
  code: string;
  companyName: string;
  catalogId: string | null;
  partnerNames: string[]; // บริษัทอื่นที่แชร์กลุ่มเดียวกัน
  productCount: number; // จำนวนแถวสินค้าในกลุ่ม (0 เมื่อยังไม่มีกลุ่ม)
};

export function CompanyCatalogBoard({
  companies,
  mergeAction,
}: {
  companies: CompanyCard[];
  mergeAction: (draggedCustomerId: string, targetCustomerId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmTextFor(dragged: CompanyCard, target: CompanyCard): string {
    if (dragged.catalogId && dragged.catalogId === target.catalogId) {
      return `"${dragged.companyName}" อยู่กลุ่มเดียวกับ "${target.companyName}" อยู่แล้ว — ยืนยันเพื่อตรวจสอบซ้ำ?`;
    }
    if (!dragged.catalogId) {
      return `เพิ่ม "${dragged.companyName}" เข้าใช้รายการสินค้าร่วมกับ "${target.companyName}"?`;
    }
    if (dragged.partnerNames.length === 0) {
      return dragged.productCount > 0
        ? `รวมกลุ่ม: ย้าย "${dragged.companyName}" พร้อมสินค้าทั้ง ${dragged.productCount} รายการ ไปรวมกับกลุ่มของ "${target.companyName}" เป็นรายการเดียว (ไม่มีสินค้าหาย/ซ้ำ)?`
        : `ย้าย "${dragged.companyName}" ไปใช้รายการสินค้าร่วมกับ "${target.companyName}"?`;
    }
    return `ย้ายเฉพาะ "${dragged.companyName}" ไปกลุ่มของ "${target.companyName}"? — สินค้า ${dragged.productCount} รายการของกลุ่มเดิมจะยังอยู่กับ ${dragged.partnerNames.join(", ")} และ "${dragged.companyName}" จะไม่เห็นรายการเหล่านั้นอีก`;
  }

  function doMerge(dragged: CompanyCard, target: CompanyCard) {
    if (dragged.id === target.id) return;
    if (dragged.catalogId && dragged.catalogId === target.catalogId) {
      setMessage({ ok: true, text: `"${dragged.companyName}" อยู่กลุ่มเดียวกับ "${target.companyName}" อยู่แล้ว` });
      return;
    }
    if (!window.confirm(confirmTextFor(dragged, target))) return;
    startTransition(async () => {
      const result = await mergeAction(dragged.id, target.id);
      if (result.success) {
        setMessage({ ok: true, text: result.message ?? "รวมกลุ่มสำเร็จ" });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error ?? "เกิดข้อผิดพลาด" });
      }
    });
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">
        ลากการ์ดบริษัทไปวางทับอีกบริษัทเพื่อรวมใช้รายการสินค้าเดียวกัน — หรือใช้ปุ่ม &quot;รวมกลุ่มกับ…&quot; บนการ์ด
      </p>

      {message && (
        <div
          role="status"
          className={`text-sm rounded px-3 py-2 border mb-3 ${
            message.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
        {companies.map((c) => {
          const isDragging = draggingId === c.id;
          const isOver = overId === c.id && draggingId !== null && draggingId !== c.id;
          return (
            <div
              key={c.id}
              draggable
              onDragStart={(e) => {
                setDraggingId(c.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", c.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setOverId(null);
              }}
              onDragOver={(e) => {
                if (draggingId && draggingId !== c.id) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverId(c.id);
                }
              }}
              onDragLeave={() => setOverId((prev) => (prev === c.id ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData("text/plain") || draggingId;
                setOverId(null);
                setDraggingId(null);
                const dragged = companies.find((x) => x.id === draggedId);
                if (dragged) doMerge(dragged, c);
              }}
              className={`bg-white border rounded-lg p-4 transition-colors ${
                isOver ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50" : "hover:border-blue-400 hover:shadow-sm"
              } ${isDragging ? "opacity-40" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <a href={`/products?company=${c.id}`} className="font-medium hover:text-blue-700">
                  {c.companyName} <span className="text-gray-400 text-sm">({c.code})</span>
                </a>
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                  {c.productCount} รายการ
                </span>
              </div>
              <div className="mt-1.5 text-xs text-gray-500">
                {c.catalogId ? (
                  c.partnerNames.length > 0 ? (
                    <>ใช้รายการร่วมกับ: {c.partnerNames.join(", ")}</>
                  ) : (
                    <>รายการสินค้าเฉพาะบริษัทนี้</>
                  )
                ) : (
                  <>ยังไม่มีรายการสินค้าของตัวเอง — กดชื่อบริษัทเพื่อเริ่มสร้าง (เห็นสินค้าส่วนกลางได้เสมอ)</>
                )}
              </div>
              {/* Fallback แบบปุ่มสำหรับ Mobile/ไม่ถนัดลาก — เลือกบริษัทปลายทางแล้วยืนยันเหมือนการลากทุกประการ */}
              {companies.length > 1 && (
                <div className="mt-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const target = companies.find((x) => x.id === e.target.value);
                      e.target.value = "";
                      if (target) doMerge(c, target);
                    }}
                    className="text-xs border rounded px-2 py-1 text-gray-600 bg-gray-50 max-w-full"
                  >
                    <option value="" disabled>
                      รวมกลุ่มกับ… ▾
                    </option>
                    {companies
                      .filter((x) => x.id !== c.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.companyName} ({x.code})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
