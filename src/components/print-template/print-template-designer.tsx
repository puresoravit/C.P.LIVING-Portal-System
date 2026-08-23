"use client";

import { useEffect, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import type { CompanySettings } from "@/lib/company-settings";
import { PRINT_PROFILES, type PrintProfileKey } from "@/lib/print-settings";
import type { SampleDensity } from "@/lib/print-sample-data";
import {
  DOCUMENT_TYPE_LABELS,
  DEFAULT_GLOBAL_TEMPLATE_SETTINGS,
  FONT_FAMILY_OPTIONS,
  FONT_FAMILY_LABELS,
  FONT_SIZE_OPTIONS,
  FONT_SIZE_LABELS,
  SPACING_DENSITY_OPTIONS,
  SPACING_DENSITY_LABELS,
  CONTENT_PADDING_OPTIONS,
  CONTENT_PADDING_LABELS,
  LOGO_SIZE_OPTIONS,
  LOGO_SIZE_LABELS,
  DEFAULT_HEADER_LAYOUT,
  type DocumentTypeKey,
  type DocumentTemplateOverride,
  type GlobalTemplateSettings,
  type OverridableTemplateSettings,
} from "@/lib/print-template-settings";
import { LogoUploadForm } from "./logo-upload-form";
import { BlockOrderEditor } from "./block-order-editor";
import { HeaderZoneEditor } from "./header-zone-editor";
import { PrintTemplateDesignerCanvas } from "./print-template-designer-canvas";

const DOC_TYPES: DocumentTypeKey[] = ["QUOTATION", "INVOICE", "TAX_INVOICE", "BILLING_NOTE", "REPAIR_NOTE"];
type DesignerTab = "GLOBAL" | DocumentTypeKey;

type OverrideState = { useGlobal: boolean; values: OverridableTemplateSettings };

function buildFormData(values: OverridableTemplateSettings): FormData {
  const fd = new FormData();
  fd.set("showAddress", values.showAddress ? "1" : "0");
  fd.set("showPhone", values.showPhone ? "1" : "0");
  fd.set("showTaxId", values.showTaxId ? "1" : "0");
  fd.set("footerNote", values.footerNote);
  fd.set("fontFamily", values.fontFamily);
  fd.set("bodyFontSize", values.bodyFontSize);
  fd.set("headingFontSize", values.headingFontSize);
  fd.set("spacingDensity", values.spacingDensity);
  fd.set("contentPadding", values.contentPadding);
  fd.set("blockOrder", JSON.stringify(values.blockOrder));
  // R6 Phase E.1 — ไม่ส่ง Field นี้เลยเมื่อเป็น null (โหมด Classic) — ตรงกับที่
  // parseHeaderLayoutField ฝั่ง Server ตีความ "ไม่มี Field" = null เหมือนกัน
  if (values.headerLayout) fd.set("headerLayout", JSON.stringify(values.headerLayout));
  return fd;
}

// R6 Phase E — Visual Document Designer: Client Component เดียวคุม State การแก้ไขทั้ง
// 6 แท็บ (Global + 5 ประเภทเอกสาร) พร้อมกัน แต่ละแท็บมี Unsaved State อิสระของตัวเอง
// (สลับแท็บไปมาไม่ทำ State ของแท็บอื่นหาย) — บันทึกจริงเมื่อกดปุ่ม "บันทึก" ของแท็บนั้น
// เท่านั้น เรียก Server Action เดิมของ R5 ตรงๆ (updateGlobalTemplateSettings/
// updateDocumentOverride) ไม่มี Schema/Action ใหม่นอกจาก resetGlobalTemplateSettings
export function PrintTemplateDesigner({
  company,
  logo,
  globalSettings,
  overrides,
  actions,
}: {
  company: CompanySettings;
  logo: string | null;
  globalSettings: GlobalTemplateSettings;
  overrides: Record<DocumentTypeKey, DocumentTemplateOverride | null>;
  actions: {
    updateGlobalTemplateSettings: (formData: FormData) => Promise<ActionResult>;
    resetGlobalTemplateSettings: () => Promise<ActionResult>;
    updateLogo: (formData: FormData) => Promise<ActionResult>;
    removeLogo: () => Promise<ActionResult>;
    updateDocumentOverride: (docType: DocumentTypeKey, formData: FormData) => Promise<ActionResult>;
  };
}) {
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);
  if (thrownError) throw thrownError;

  const [activeTab, setActiveTab] = useState<DesignerTab>("GLOBAL");
  const [globalValues, setGlobalValues] = useState<GlobalTemplateSettings>(globalSettings);
  const [overrideStates, setOverrideStates] = useState<Record<DocumentTypeKey, OverrideState>>(() => {
    const { logoSize: _logoSize, ...globalOverridable } = globalSettings;
    return Object.fromEntries(
      DOC_TYPES.map((dt) => [dt, { useGlobal: overrides[dt] === null, values: { ...globalOverridable, ...overrides[dt] } }])
    ) as Record<DocumentTypeKey, OverrideState>;
  });
  const [previewDocType, setPreviewDocType] = useState<DocumentTypeKey>("QUOTATION");
  const [previewProfile, setPreviewProfile] = useState<PrintProfileKey>("a4");
  const [density, setDensity] = useState<SampleDensity>("short");

  // Deep-link จากเมนู "แก้ไข / Edit Form" (#QUOTATION ฯลฯ — ดู nav-tree.ts) — คงพฤติกรรมเดิม
  // ต้องฟัง "hashchange" ด้วย ไม่ใช่แค่ตอน Mount ครั้งแรก: การเปลี่ยน URL Fragment ระหว่าง
  // อยู่ในหน้าเดิม (เช่นกด Sidebar Link ไปอีกประเภทเอกสารขณะเปิด Designer ค้างอยู่) ไม่ทำให้
  // Browser Reload หน้า (Hash-only Navigation) จึง useEffect([]) เดิมจะไม่ทำงานซ้ำ
  useEffect(() => {
    function applyHash() {
      const hash = window.location.hash.slice(1);
      if ((DOC_TYPES as string[]).includes(hash)) setActiveTab(hash as DocumentTypeKey);
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    if (activeTab !== "GLOBAL") setPreviewDocType(activeTab);
  }, [activeTab]);

  const isDocTab = activeTab !== "GLOBAL";
  const currentOverride = isDocTab ? overrideStates[activeTab as DocumentTypeKey] : null;
  const effective: OverridableTemplateSettings =
    activeTab === "GLOBAL" ? globalValues : currentOverride!.useGlobal ? globalValues : currentOverride!.values;

  function updateField(patch: Partial<OverridableTemplateSettings>) {
    if (activeTab === "GLOBAL") {
      setGlobalValues((prev) => ({ ...prev, ...patch }));
      return;
    }
    const docType = activeTab;
    setOverrideStates((prev) => {
      const cur = prev[docType];
      const base = cur.useGlobal ? globalValues : cur.values;
      return { ...prev, [docType]: { useGlobal: false, values: { ...base, ...patch } } };
    });
  }

  function setUseGlobal(next: boolean) {
    if (activeTab === "GLOBAL") return;
    const docType = activeTab;
    setOverrideStates((prev) => ({ ...prev, [docType]: { ...prev[docType], useGlobal: next } }));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        let result: ActionResult;
        if (activeTab === "GLOBAL") {
          const fd = buildFormData(globalValues);
          fd.set("logoSize", globalValues.logoSize);
          result = await actions.updateGlobalTemplateSettings(fd);
        } else {
          const state = overrideStates[activeTab];
          const fd = new FormData();
          fd.set("useGlobal", state.useGlobal ? "1" : "0");
          if (!state.useGlobal) {
            buildFormData(state.values).forEach((v, k) => fd.set(k, v as string));
          }
          result = await actions.updateDocumentOverride(activeTab, fd);
        }
        if (result.success) showSuccess("บันทึกสำเร็จ — มีผลกับหน้าพิมพ์จริงทันที");
        else showError(result.error);
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  function handleResetToDefault() {
    startTransition(async () => {
      try {
        let result: ActionResult;
        if (activeTab === "GLOBAL") {
          result = await actions.resetGlobalTemplateSettings();
          if (result.success) setGlobalValues(DEFAULT_GLOBAL_TEMPLATE_SETTINGS);
        } else {
          const docType = activeTab;
          const fd = new FormData();
          fd.set("useGlobal", "1");
          result = await actions.updateDocumentOverride(docType, fd);
          if (result.success) setOverrideStates((prev) => ({ ...prev, [docType]: { useGlobal: true, values: prev[docType].values } }));
        }
        if (result.success) showSuccess("รีเซ็ตเป็นค่าเริ่มต้นสำเร็จ");
        else showError(result.error);
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  const previewSettings = { ...effective, logo, logoSize: globalValues.logoSize };

  return (
    <div>
      {/* Desktop-focused per Requirement — Tablet/Mobile แสดงแค่ Notice ไม่ Break Navigation */}
      <div className="lg:hidden bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        Visual Document Designer ออกแบบมาสำหรับหน้าจอ Desktop (แนะนำความกว้างอย่างน้อย 1024px) —
        กรุณาเปิดหน้านี้บนคอมพิวเตอร์เพื่อใช้งาน Drag & Drop และแก้ไข Template แบบเต็มรูปแบบ
      </div>

      <div className="hidden lg:block">
        <div className="flex flex-wrap gap-1.5 mb-3 border-b pb-3">
          <TabButton active={activeTab === "GLOBAL"} onClick={() => setActiveTab("GLOBAL")}>
            ค่าเริ่มต้น (Global)
          </TabButton>
          {DOC_TYPES.map((dt) => (
            <TabButton key={dt} active={activeTab === dt} onClick={() => setActiveTab(dt)}>
              {DOCUMENT_TYPE_LABELS[dt]}
              {overrideStates[dt].useGlobal === false && <span className="ml-1 text-blue-600">●</span>}
            </TabButton>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {activeTab === "GLOBAL" && (
                <label className="flex items-center gap-1.5">
                  แสดงตัวอย่างเอกสาร:
                  <select
                    value={previewDocType}
                    onChange={(e) => setPreviewDocType(e.target.value as DocumentTypeKey)}
                    className="border rounded px-2 py-1"
                  >
                    {DOC_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {DOCUMENT_TYPE_LABELS[dt]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-1.5">
                ขนาดกระดาษ:
                <select
                  value={previewProfile}
                  onChange={(e) => setPreviewProfile(e.target.value as PrintProfileKey)}
                  className="border rounded px-2 py-1"
                >
                  {Object.entries(PRINT_PROFILES).map(([key, p]) => (
                    <option key={key} value={key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                จำนวนรายการตัวอย่าง:
                <select value={density} onChange={(e) => setDensity(e.target.value as SampleDensity)} className="border rounded px-2 py-1">
                  <option value="short">น้อย</option>
                  <option value="long">มาก (ทดสอบ Pagination)</option>
                </select>
              </label>
            </div>

            <PrintTemplateDesignerCanvas
              docType={previewDocType}
              settings={previewSettings}
              company={company}
              profile={previewProfile}
              density={density}
            />

            <p className="text-xs text-gray-400">
              * พื้นที่ตัวอย่างนี้เป็นความสูงยืดหยุ่นตามเนื้อหา ไม่ได้จำลองการตัดหน้า (Pagination) จริง — ต้องตรวจสอบ
              การจัดหน้าจริงผ่าน Print Preview/บันทึกเป็น PDF ของเอกสารจริงอีกครั้งเสมอ (ข้อจำกัดเดียวกับระบบพิมพ์เดิม)
            </p>
          </div>

          <div className="space-y-4">
            {isDocTab && (
              <div className="bg-white border rounded-lg p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={currentOverride!.useGlobal}
                    onChange={(e) => setUseGlobal(e.target.checked)}
                  />
                  ใช้ค่า Global (ไม่กำหนดเฉพาะประเภทนี้)
                </label>
              </div>
            )}

            {(!isDocTab || !currentOverride!.useGlobal) && (
              <>
                {activeTab === "GLOBAL" && (
                  <Section title="โลโก้ (ใช้ร่วมกันทุกเอกสาร)">
                    <LogoUploadForm currentLogo={logo} updateLogoAction={actions.updateLogo} removeLogoAction={actions.removeLogo} />
                    <PropSelect
                      label="ขนาดโลโก้"
                      value={globalValues.logoSize}
                      onChange={(v) => setGlobalValues((p) => ({ ...p, logoSize: v as GlobalTemplateSettings["logoSize"] }))}
                      options={LOGO_SIZE_OPTIONS}
                      labels={LOGO_SIZE_LABELS}
                    />
                  </Section>
                )}
                {isDocTab && (
                  <p className="text-xs text-gray-400 -mt-2">โลโก้เป็นค่า Global เสมอ — แก้ไขได้ที่แท็บ &quot;ค่าเริ่มต้น (Global)&quot;</p>
                )}

                <Section title="หัวกระดาษบริษัท">
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={effective.showAddress} onChange={(e) => updateField({ showAddress: e.target.checked })} />
                      แสดงที่อยู่
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={effective.showPhone} onChange={(e) => updateField({ showPhone: e.target.checked })} />
                      แสดงเบอร์โทร
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={effective.showTaxId} onChange={(e) => updateField({ showTaxId: e.target.checked })} />
                      แสดงเลขผู้เสียภาษี
                    </label>
                  </div>
                </Section>

                <Section title="โครงสร้าง Header">
                  <label className="flex items-center gap-2 text-xs mb-2">
                    <input
                      type="checkbox"
                      checked={effective.headerLayout !== null}
                      onChange={(e) =>
                        updateField({ headerLayout: e.target.checked ? (effective.headerLayout ?? DEFAULT_HEADER_LAYOUT) : null })
                      }
                    />
                    ใช้ Header Layout แบบละเอียด (Custom — วาง/ปรับขนาด Element อิสระ)
                  </label>
                  {effective.headerLayout ? (
                    <HeaderZoneEditor layout={effective.headerLayout} onChange={(next) => updateField({ headerLayout: next })} />
                  ) : (
                    <BlockOrderEditor order={effective.blockOrder} onChange={(next) => updateField({ blockOrder: next })} />
                  )}
                  {effective.headerLayout && <LockedBlocksHint />}
                </Section>

                <Section title="ตัวอักษร">
                  <PropSelect
                    label="Font Family"
                    value={effective.fontFamily}
                    onChange={(v) => updateField({ fontFamily: v as OverridableTemplateSettings["fontFamily"] })}
                    options={FONT_FAMILY_OPTIONS}
                    labels={FONT_FAMILY_LABELS}
                  />
                  <PropSelect
                    label="ขนาดตัวอักษรเนื้อหา"
                    value={effective.bodyFontSize}
                    onChange={(v) => updateField({ bodyFontSize: v as OverridableTemplateSettings["bodyFontSize"] })}
                    options={FONT_SIZE_OPTIONS}
                    labels={FONT_SIZE_LABELS}
                  />
                  <PropSelect
                    label="ขนาดตัวอักษรหัวเรื่อง"
                    value={effective.headingFontSize}
                    onChange={(v) => updateField({ headingFontSize: v as OverridableTemplateSettings["headingFontSize"] })}
                    options={FONT_SIZE_OPTIONS}
                    labels={FONT_SIZE_LABELS}
                  />
                </Section>

                <Section title="ระยะห่าง">
                  <PropSelect
                    label="ระยะห่าง (Spacing Density)"
                    value={effective.spacingDensity}
                    onChange={(v) => updateField({ spacingDensity: v as OverridableTemplateSettings["spacingDensity"] })}
                    options={SPACING_DENSITY_OPTIONS}
                    labels={SPACING_DENSITY_LABELS}
                  />
                  <PropSelect
                    label="ระยะขอบในพื้นที่พิมพ์ (Content Padding)"
                    value={effective.contentPadding}
                    onChange={(v) => updateField({ contentPadding: v as OverridableTemplateSettings["contentPadding"] })}
                    options={CONTENT_PADDING_OPTIONS}
                    labels={CONTENT_PADDING_LABELS}
                  />
                </Section>

                <Section title="ท้ายเอกสาร">
                  <label className="block text-xs font-medium text-gray-600 mb-1">ข้อความท้ายเอกสาร (สูงสุด 200 ตัวอักษร)</label>
                  <textarea
                    value={effective.footerNote}
                    onChange={(e) => updateField({ footerNote: e.target.value })}
                    maxLength={200}
                    rows={2}
                    className="w-full border rounded px-3 py-1.5 text-sm"
                  />
                </Section>
              </>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={isPending}
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded px-4 py-2"
              >
                {isPending ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleResetToDefault}
                className="text-sm text-gray-600 hover:text-red-600 border rounded px-4 py-2 disabled:opacity-40"
              >
                รีเซ็ตเป็นค่าเริ่มต้น (Default)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// R6 Phase E.1 — เตือนซ้ำในโหมด Header Layout แบบละเอียดด้วยว่า Block ล่างยังตรึงเหมือนเดิม
// (BlockOrderEditor เองก็มี Hint นี้อยู่แล้วสำหรับโหมด Classic — ที่นี่คือฝั่ง Custom)
function LockedBlocksHint() {
  return (
    <div className="space-y-1.5 mt-2">
      <div className="border rounded px-2 py-1.5 text-xs bg-gray-50 text-gray-500 flex items-center gap-2">
        <span aria-hidden>🔒</span>
        <span>ตารางรายการ + สรุปยอด (ตำแหน่งตรึงถาวร — กันเนื้อหาล้น/ทับหน้าเวลารายการยาว)</span>
      </div>
      <div className="border rounded px-2 py-1.5 text-xs bg-gray-50 text-gray-500 flex items-center gap-2">
        <span aria-hidden>🔒</span>
        <span>ลายเซ็น + ท้ายเอกสาร (ตำแหน่งตรึงถาวร — ชิดขอบล่างเสมอ)</span>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-sm font-medium ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-lg p-3 space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function PropSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  labels: Record<T, string>;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="w-full border rounded px-2 py-1.5 text-sm">
        {options.map((key) => (
          <option key={key} value={key}>
            {labels[key]}
          </option>
        ))}
      </select>
    </div>
  );
}
