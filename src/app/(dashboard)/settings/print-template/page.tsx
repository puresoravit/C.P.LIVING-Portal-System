import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getCompanySettings } from "@/lib/company-settings";
import { PrintTemplateDesigner } from "@/components/print-template/print-template-designer";
import {
  getGlobalTemplateSettingsRaw,
  getDocumentTemplateOverrideRaw,
  type DocumentTypeKey,
} from "@/lib/print-template-settings";
import {
  updateGlobalTemplateSettings,
  resetGlobalTemplateSettings,
  updateLogo,
  removeLogo,
  updateDocumentOverride,
} from "./actions";

const DOCUMENT_TYPES: DocumentTypeKey[] = ["QUOTATION", "INVOICE", "TAX_INVOICE", "BILLING_NOTE", "REPAIR_NOTE"];

// R6 Phase E — เมนู "แก้ไข / Edit Form" เปิดหน้านี้เป็น Visual Document Designer จริง
// (ไม่ใช่ฟอร์มธรรมดาอีกต่อไป) — ยังคง Reuse getGlobalTemplateSettingsRaw/
// getDocumentTemplateOverrideRaw/Server Actions เดิมของ R5 ทั้งหมด ไม่มี Schema/Route
// ใหม่ — Deep-link ผ่าน URL Fragment (#QUOTATION ฯลฯ) ยังทำงานเหมือนเดิม (อ่านใน
// PrintTemplateDesigner เอง)
export default async function PrintTemplateSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "user.manage")) redirect("/");

  const [{ settings, logo }, company] = await Promise.all([getGlobalTemplateSettingsRaw(), getCompanySettings()]);
  const overridesArr = await Promise.all(DOCUMENT_TYPES.map((docType) => getDocumentTemplateOverrideRaw(docType)));
  const overrides = Object.fromEntries(DOCUMENT_TYPES.map((dt, i) => [dt, overridesArr[i]])) as Record<
    DocumentTypeKey,
    (typeof overridesArr)[number]
  >;

  return (
    <div className="max-w-[1400px]">
      <h1 className="text-lg font-semibold mb-1">แก้ไขแบบฟอร์มเอกสาร / Document Designer</h1>
      <p className="text-sm text-gray-500 mb-4">
        ปรับรูปแบบเอกสารพิมพ์ (ใบเสนอราคา, ใบส่งของชั่วคราว, ใบกำกับภาษี, ใบวางบิล, ใบส่งคืนสินค้าฝากซ่อม) — ยังไม่ได้ตั้งค่าใดๆ
        จะแสดงผลเหมือนเดิมทุกประการ มีผลกับการพิมพ์/บันทึกเป็น PDF จริง ไม่กระทบยอดเงิน/VAT/เลขที่เอกสารใดๆ
      </p>

      <PrintTemplateDesigner
        company={company}
        logo={logo}
        globalSettings={settings}
        overrides={overrides}
        actions={{ updateGlobalTemplateSettings, resetGlobalTemplateSettings, updateLogo, removeLogo, updateDocumentOverride }}
      />
    </div>
  );
}
