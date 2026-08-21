"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, SelectField, TextareaField } from "@/components/form/fields";
import type { ActionResult } from "@/lib/action-result";
import {
  FONT_FAMILY_OPTIONS,
  FONT_FAMILY_LABELS,
  FONT_SIZE_OPTIONS,
  FONT_SIZE_LABELS,
  SPACING_DENSITY_OPTIONS,
  SPACING_DENSITY_LABELS,
  CONTENT_PADDING_OPTIONS,
  CONTENT_PADDING_LABELS,
  type DocumentTypeKey,
  type DocumentTemplateOverride,
  type GlobalTemplateSettings,
} from "@/lib/print-template-settings";

// R5 — Per-Document Override: Default ใช้ Global เสมอ (currentOverride === null) —
// ปลดติ๊ก "ใช้ค่า Global" เพื่อกำหนดค่าเฉพาะประเภทเอกสารนี้ (Override เต็มชุด 4 Field
// ไม่รวม logoSize ตามที่อนุมัติว่า Logo เป็น Global-only) ค่าเริ่มต้นของ Field ที่โชว์
// ตอนปลดติ๊กใหม่ๆ = ค่า Global ปัจจุบัน (ไม่ใช่ Empty) ให้ Owner ปรับจากจุดเดิม
export function DocumentOverrideForm({
  docType,
  label,
  currentOverride,
  globalDefaults,
  action,
}: {
  docType: DocumentTypeKey;
  label: string;
  currentOverride: DocumentTemplateOverride | null;
  globalDefaults: GlobalTemplateSettings;
  action: (docType: DocumentTypeKey, formData: FormData) => Promise<ActionResult>;
}) {
  const [useGlobal, setUseGlobal] = useState(currentOverride === null);
  const boundAction = action.bind(null, docType);
  const base = { ...globalDefaults, ...currentOverride };

  return (
    <details className="bg-white border rounded-lg" open={!useGlobal}>
      <summary className="cursor-pointer px-4 py-3 font-medium text-sm flex items-center justify-between">
        <span>{label}</span>
        {!useGlobal && <span className="text-xs text-blue-600 font-normal">กำหนดค่าเฉพาะ</span>}
      </summary>
      <ActionForm action={boundAction} successMessage="บันทึกสำเร็จ" className="px-4 pb-4 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="useGlobal"
            value="1"
            checked={useGlobal}
            onChange={(e) => setUseGlobal(e.target.checked)}
          />
          ใช้ค่า Global (ไม่กำหนดเฉพาะประเภทนี้)
        </label>

        {!useGlobal && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="col-span-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="showAddress" value="1" defaultChecked={base.showAddress} />
                แสดงที่อยู่
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="showPhone" value="1" defaultChecked={base.showPhone} />
                แสดงเบอร์โทร
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="showTaxId" value="1" defaultChecked={base.showTaxId} />
                แสดงเลขผู้เสียภาษี
              </label>
            </div>
            <SelectField label="Font Family" name="fontFamily" defaultValue={base.fontFamily}>
              {FONT_FAMILY_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {FONT_FAMILY_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="ขนาดตัวอักษรเนื้อหา" name="bodyFontSize" defaultValue={base.bodyFontSize}>
              {FONT_SIZE_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {FONT_SIZE_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="ขนาดตัวอักษรหัวเรื่อง" name="headingFontSize" defaultValue={base.headingFontSize}>
              {FONT_SIZE_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {FONT_SIZE_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="ระยะห่าง (Spacing Density)" name="spacingDensity" defaultValue={base.spacingDensity}>
              {SPACING_DENSITY_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {SPACING_DENSITY_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="ระยะขอบในพื้นที่พิมพ์ (Content Padding)" name="contentPadding" defaultValue={base.contentPadding}>
              {CONTENT_PADDING_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {CONTENT_PADDING_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <div className="col-span-2">
              <TextareaField label="ข้อความท้ายเอกสาร (สูงสุด 200 ตัวอักษร)" name="footerNote" defaultValue={base.footerNote} rows={2} />
            </div>
          </div>
        )}

        <SubmitButton>บันทึก</SubmitButton>
      </ActionForm>
    </details>
  );
}
