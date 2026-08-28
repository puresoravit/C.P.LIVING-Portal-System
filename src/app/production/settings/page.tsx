import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { formatDepartmentsText, formatSizesText, getProductionSettings } from "@/lib/production-settings";
import { updateProductionSettings } from "./actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { TextareaField } from "@/components/form/fields";

export default async function ProductionSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "productionSetting.manage")) redirect("/");

  const settings = await getProductionSettings();

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">ตั้งค่าการผลิต</h1>
      <p className="text-sm text-gray-500 mb-4">
        ค่าที่ใช้ในโมดูล Production &amp; Delivery — ไซส์ที่ผลิตได้จริง และแผนก/จำนวนชุดที่พิมพ์ใบสั่งผลิต
        (แก้ได้ตลอด ไม่ต้องแก้โค้ด)
      </p>

      <ActionForm action={updateProductionSettings} successMessage="บันทึกค่าตั้งค่าสำเร็จ" className="bg-white border rounded-lg p-4 space-y-4">
        <TextareaField
          label='ไซส์ที่ผลิตได้ (คั่นด้วย , เช่น "3, 3.5, 4, 5, 6, สั่งตัด")'
          name="sizes"
          defaultValue={formatSizesText(settings.sizes)}
          rows={2}
        />
        <TextareaField
          label='แผนกและจำนวนชุดที่พิมพ์ (บรรทัดละ 1 แผนก รูปแบบ "ชื่อแผนก, จำนวนชุด")'
          name="departments"
          defaultValue={formatDepartmentsText(settings.departments)}
          rows={4}
        />
        <p className="text-xs text-gray-500">
          รวมจำนวนชุดปัจจุบัน: {settings.departments.reduce((sum, d) => sum + d.copies, 0)} ชุด
        </p>
        <SubmitButton>บันทึก</SubmitButton>
      </ActionForm>
    </div>
  );
}
