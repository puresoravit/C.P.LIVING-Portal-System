import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { SelectField, TextareaField } from "@/components/form/fields";
import { LogoUploadForm } from "@/components/print-template/logo-upload-form";
import { DocumentOverrideForm } from "@/components/print-template/document-override-form";
import { ScrollToHash } from "@/components/scroll-to-hash";
import {
  getGlobalTemplateSettingsRaw,
  getDocumentTemplateOverrideRaw,
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
  DOCUMENT_TYPE_LABELS,
  type DocumentTypeKey,
} from "@/lib/print-template-settings";
import { updateGlobalTemplateSettings, updateLogo, removeLogo, updateDocumentOverride } from "./actions";

const DOCUMENT_TYPES: DocumentTypeKey[] = ["QUOTATION", "INVOICE", "TAX_INVOICE", "BILLING_NOTE", "REPAIR_NOTE"];

export default async function PrintTemplateSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "user.manage")) redirect("/");

  const { settings, logo } = await getGlobalTemplateSettingsRaw();
  const overrides = await Promise.all(DOCUMENT_TYPES.map((docType) => getDocumentTemplateOverrideRaw(docType)));

  return (
    <div className="max-w-2xl">
      <ScrollToHash />
      <h1 className="text-lg font-semibold mb-1">รูปแบบเอกสาร / Print Template</h1>
      <p className="text-sm text-gray-500 mb-4">
        ปรับรูปแบบเอกสารพิมพ์ (ใบเสนอราคา, ใบส่งของชั่วคราว, ใบกำกับภาษี, ใบวางบิล, ใบส่งคืนสินค้าฝากซ่อม) — ยังไม่ได้ตั้งค่าใดๆ
        จะแสดงผลเหมือนเดิมทุกประการ มีผลกับการพิมพ์/บันทึกเป็น PDF จริง ไม่กระทบยอดเงิน/VAT/เลขที่เอกสารใดๆ
      </p>

      <div className="bg-white border rounded-lg p-4 mb-4">
        <h2 className="font-medium text-sm mb-3">โลโก้ (ใช้ร่วมกันทุกเอกสาร)</h2>
        <LogoUploadForm currentLogo={logo} updateLogoAction={updateLogo} removeLogoAction={removeLogo} />
      </div>

      <div className="bg-white border rounded-lg p-4 mb-4">
        <h2 className="font-medium text-sm mb-3">ค่าเริ่มต้น (Global) — ใช้กับทุกประเภทเอกสารที่ไม่ได้กำหนดเฉพาะ</h2>
        <ActionForm action={updateGlobalTemplateSettings} successMessage="บันทึกสำเร็จ" className="space-y-3">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="showAddress" value="1" defaultChecked={settings.showAddress} />
              แสดงที่อยู่
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="showPhone" value="1" defaultChecked={settings.showPhone} />
              แสดงเบอร์โทร
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="showTaxId" value="1" defaultChecked={settings.showTaxId} />
              แสดงเลขผู้เสียภาษี
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Font Family" name="fontFamily" defaultValue={settings.fontFamily}>
              {FONT_FAMILY_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {FONT_FAMILY_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="ขนาดโลโก้" name="logoSize" defaultValue={settings.logoSize}>
              {LOGO_SIZE_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {LOGO_SIZE_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="ขนาดตัวอักษรเนื้อหา" name="bodyFontSize" defaultValue={settings.bodyFontSize}>
              {FONT_SIZE_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {FONT_SIZE_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="ขนาดตัวอักษรหัวเรื่อง" name="headingFontSize" defaultValue={settings.headingFontSize}>
              {FONT_SIZE_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {FONT_SIZE_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="ระยะห่าง (Spacing Density)" name="spacingDensity" defaultValue={settings.spacingDensity}>
              {SPACING_DENSITY_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {SPACING_DENSITY_LABELS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="ระยะขอบในพื้นที่พิมพ์ (Content Padding)" name="contentPadding" defaultValue={settings.contentPadding}>
              {CONTENT_PADDING_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {CONTENT_PADDING_LABELS[key]}
                </option>
              ))}
            </SelectField>
          </div>

          <TextareaField label="ข้อความท้ายเอกสาร (สูงสุด 200 ตัวอักษร)" name="footerNote" defaultValue={settings.footerNote} rows={2} />

          <SubmitButton>บันทึก Global Settings</SubmitButton>
        </ActionForm>
      </div>

      <h2 className="font-medium text-sm mb-2">กำหนดเฉพาะรายประเภทเอกสาร (Override)</h2>
      <div className="space-y-2">
        {DOCUMENT_TYPES.map((docType, i) => (
          <DocumentOverrideForm
            key={docType}
            docType={docType}
            label={DOCUMENT_TYPE_LABELS[docType]}
            currentOverride={overrides[i]}
            globalDefaults={settings}
            action={updateDocumentOverride}
          />
        ))}
      </div>
    </div>
  );
}
