import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { formatDepartmentsText, formatMaxFabricsPerPlacementText, formatSizesText, getProductionSettings } from "@/lib/production-settings";
import { updateProductionSettings } from "./actions";
import { ActionForm, SubmitButton } from "@/components/form/action-form";
import { Field, TextareaField } from "@/components/form/fields";

export default async function ProductionSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "productionSetting.manage")) redirect("/");

  const settings = await getProductionSettings();

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">ตั้งค่าการผลิต</h1>
      <p className="text-sm text-gray-500 mb-4">
        ค่าที่ใช้ในโมดูล Production &amp; Delivery — ไซส์ที่ผลิตได้จริง แผนก/จำนวนชุดที่พิมพ์ใบสั่งผลิต
        และสถานะ P.O. ลูกค้า (แก้ได้ตลอด ไม่ต้องแก้โค้ด)
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
        <TextareaField
          label='สถานะ P.O. ลูกค้า (คั่นด้วย , รายการแรก = สถานะเริ่มต้นตอนรับ P.O. ใหม่)'
          name="customerPoStatuses"
          defaultValue={formatSizesText(settings.customerPoStatuses)}
          rows={2}
        />
        <TextareaField
          label='สถานะใบสั่งผลิต (คั่นด้วย , รายการแรก = สถานะเริ่มต้นตอน Confirm/Issue)'
          name="productionOrderStatuses"
          defaultValue={formatSizesText(settings.productionOrderStatuses)}
          rows={2}
        />
        <Field
          label="จำนวนกุ๊นสูงสุด (current business validation — เปลี่ยนได้ถ้ากฎธุรกิจเปลี่ยน)"
          name="maxGussetCount"
          type="number"
          min={1}
          defaultValue={String(settings.maxGussetCount)}
        />
        <TextareaField
          label='จำนวนผ้าสูงสุดต่อ placement เฉพาะที่ยกเว้นจากค่าเริ่มต้น 1 ผ้า (บรรทัดละ 1 รายการ รูปแบบ "ชื่อ placement, จำนวน" เช่น "SIDE, 2" — placement ที่ไม่ระบุใช้ค่าเริ่มต้น 1 ผ้าเสมอ)'
          name="maxFabricsPerPlacement"
          defaultValue={formatMaxFabricsPerPlacementText(settings.maxFabricsPerPlacement)}
          rows={2}
        />
        <Field
          label="จำนวนสำเนาใบสั่งผลิต (พิมพ์กี่ชุดต่อครั้ง — เนื้อหาเหมือนกันทุกชุด)"
          name="printCopies"
          type="number"
          min={1}
          defaultValue={String(settings.printCopies)}
        />
        <Field
          label='สถานะใบสั่งผลิตเมื่อกด "ยืนยันเริ่มผลิตและพิมพ์" ครั้งแรก'
          name="inProgressStatus"
          defaultValue={settings.inProgressStatus}
        />
        <SubmitButton>บันทึก</SubmitButton>
      </ActionForm>
    </div>
  );
}
