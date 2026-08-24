"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";

// R4 — Size Architecture Path A: เลือกได้หลาย Size พร้อมกัน กำหนดราคาต่อ Size ในหน้าจอ
// เดียว ระบบสร้าง Product + Auto-SKU ให้ด้านหลังทั้งหมด — ตัวเลือก Size ชุดเดียวกับ
// SizeSelect (R1): 3/3.5/4/5/6 ฟุต, ไม่มีขนาด, ขนาดพิเศษ/ระบุเอง — Size ที่ Model นี้มี
// อยู่แล้วจะไม่แสดงเป็นตัวเลือกซ้ำ (กันสร้างซ้ำโดยไม่ตั้งใจ)
const STANDARD_SIZES = ["3 ฟุต", "3.5 ฟุต", "4 ฟุต", "5 ฟุต", "6 ฟุต"];
const NONE_SIZE_LABEL = "ไม่มีขนาด";

type SizeRow = { size: string; label: string; checked: boolean; price: string };

export function BatchSizeForm({
  modelId,
  existingSizes,
  defaultUnit,
  action,
}: {
  modelId: string;
  existingSizes: string[];
  defaultUnit: string;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const existingSet = new Set(existingSizes);
  const availableStandard = STANDARD_SIZES.filter((s) => !existingSet.has(s));
  const noneAvailable = !existingSet.has("");

  const [rows, setRows] = useState<SizeRow[]>(
    availableStandard.map((s) => ({ size: s, label: s, checked: false, price: "" }))
  );
  const [noneChecked, setNoneChecked] = useState(false);
  const [nonePrice, setNonePrice] = useState("");
  const [customChecked, setCustomChecked] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [unit, setUnit] = useState(defaultUnit);

  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);

  if (thrownError) throw thrownError;

  function updateRow(idx: number, patch: Partial<SizeRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const hasAnySelection =
    rows.some((r) => r.checked) || (noneAvailable && noneChecked) || (customChecked && customLabel.trim());
  const canSubmit = hasAnySelection && !isPending;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    const sizes: { size: string; price: number }[] = [];
    for (const r of rows) {
      if (r.checked && r.price !== "") sizes.push({ size: r.size, price: Number(r.price) });
    }
    if (noneAvailable && noneChecked && nonePrice !== "") sizes.push({ size: "", price: Number(nonePrice) });
    if (customChecked && customLabel.trim() && customPrice !== "") {
      sizes.push({ size: customLabel.trim(), price: Number(customPrice) });
    }
    if (sizes.length === 0) return;

    const formData = new FormData();
    formData.set("sizesJson", JSON.stringify(sizes));
    formData.set("unit", unit);

    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result.success) {
          showSuccess("เพิ่มไซส์สำเร็จ");
          setRows((prev) => prev.map((r) => ({ ...r, checked: false, price: "" })));
          setNoneChecked(false);
          setNonePrice("");
          setCustomChecked(false);
          setCustomLabel("");
          setCustomPrice("");
        } else {
          showError(result.error);
        }
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  if (availableStandard.length === 0 && !noneAvailable) {
    return (
      <p className="text-sm text-gray-400">รุ่นนี้มีครบทุกไซส์มาตรฐานแล้ว — เพิ่มได้เฉพาะขนาดพิเศษด้านล่าง</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="max-w-xs">
        <label className="block text-xs font-medium text-gray-600 mb-1">หน่วยนับ (ใช้ร่วมกันทุกไซส์ที่เลือก) *</label>
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          required
          disabled={isPending}
          className="w-full border rounded px-3 py-1.5 text-sm"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2 font-medium">ไซส์</th>
              <th className="px-3 py-2 font-medium">ราคา (รวม VAT)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.size} className="border-t">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    disabled={isPending}
                    onChange={(e) => updateRow(idx, { checked: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.price}
                    disabled={!row.checked || isPending}
                    onChange={(e) => updateRow(idx, { price: e.target.value })}
                    className="w-32 border rounded px-2 py-1 text-sm disabled:bg-gray-100"
                  />
                </td>
              </tr>
            ))}
            {noneAvailable && (
              <tr className="border-t">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={noneChecked}
                    disabled={isPending}
                    onChange={(e) => setNoneChecked(e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2">{NONE_SIZE_LABEL}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={nonePrice}
                    disabled={!noneChecked || isPending}
                    onChange={(e) => setNonePrice(e.target.value)}
                    className="w-32 border rounded px-2 py-1 text-sm disabled:bg-gray-100"
                  />
                </td>
              </tr>
            )}
            <tr className="border-t">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={customChecked}
                  disabled={isPending}
                  onChange={(e) => setCustomChecked(e.target.checked)}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  disabled={!customChecked || isPending}
                  placeholder="ขนาดพิเศษ / ระบุเอง"
                  className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-100"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customPrice}
                  disabled={!customChecked || isPending}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-32 border rounded px-2 py-1 text-sm disabled:bg-gray-100"
                />
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2"
      >
        {isPending ? "กำลังเพิ่ม..." : "เพิ่มไซส์ที่เลือก"}
      </button>
    </form>
  );
}
