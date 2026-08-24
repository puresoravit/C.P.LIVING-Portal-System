import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

const ALL_PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  { key: "customer.view", label: "ดูลูกค้า", group: "ลูกค้า/สาขา" },
  { key: "customer.edit", label: "แก้ไขลูกค้า", group: "ลูกค้า/สาขา" },
  { key: "branch.view", label: "ดูสาขา", group: "ลูกค้า/สาขา" },
  { key: "branch.edit", label: "แก้ไขสาขา", group: "ลูกค้า/สาขา" },
  { key: "product.view", label: "ดูสินค้า", group: "สินค้า" },
  { key: "product.edit", label: "แก้ไขสินค้า", group: "สินค้า" },
  { key: "productType.view", label: "ดูกลุ่มส่วนลด", group: "สินค้า" },
  { key: "productType.edit", label: "แก้ไขกลุ่มส่วนลด", group: "สินค้า" },
  { key: "price.view", label: "ดูราคา", group: "ราคา/ส่วนลด" },
  { key: "price.edit", label: "แก้ไขราคา / ตั้งค่า VAT", group: "ราคา/ส่วนลด" },
  { key: "discount.view", label: "ดูส่วนลด", group: "ราคา/ส่วนลด" },
  { key: "discount.edit", label: "แก้ไขส่วนลด", group: "ราคา/ส่วนลด" },
  { key: "order.create", label: "สร้างออเดอร์", group: "ขาย" },
  { key: "order.editDraft", label: "แก้ไข Order Draft", group: "ขาย" },
  { key: "order.confirm", label: "Confirm ออเดอร์", group: "ขาย" },
  { key: "order.cancel", label: "ยกเลิกออเดอร์", group: "ขาย" },
  { key: "invoice.create", label: "สร้าง Invoice", group: "เอกสาร" },
  { key: "invoice.cancel", label: "ยกเลิก Invoice", group: "เอกสาร" },
  { key: "invoice.print", label: "พิมพ์ Invoice", group: "เอกสาร" },
  { key: "taxInvoice.create", label: "สร้างใบกำกับภาษี", group: "เอกสาร" },
  { key: "taxInvoice.cancel", label: "ยกเลิกใบกำกับภาษี", group: "เอกสาร" },
  { key: "billingNote.create", label: "สร้างใบวางบิล", group: "เอกสาร" },
  { key: "repairNote.create", label: "สร้างใบส่งคืนซ่อม", group: "เอกสาร" },
  { key: "report.view", label: "ดู Dashboard/Report", group: "รายงาน" },
  { key: "report.export", label: "Export รายงาน", group: "รายงาน" },
  { key: "user.manage", label: "จัดการผู้ใช้/ตั้งค่าระบบ", group: "ระบบ" },
  { key: "auditLog.view", label: "ดู Audit Log", group: "ระบบ" },
];

const ROLES: { key: Role; label: string }[] = [
  { key: "OWNER_ADMIN", label: "ผู้ดูแลระบบ" },
  { key: "BILLING_STAFF", label: "พนักงานออกบิล" },
  { key: "VIEWER", label: "ผู้ดูรายงาน" },
];

export default async function PermissionsPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "user.manage")) redirect("/");

  const groups = [...new Set(ALL_PERMISSIONS.map((p) => p.group))];

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-1">สิทธิ์การใช้งาน (Permission Review)</h1>
      <p className="text-sm text-gray-500 mb-4">
        แสดงสิทธิ์ปัจจุบันของแต่ละ Role — ดูอย่างเดียว หากต้องการเปลี่ยนสิทธิ์ ต้องแก้ที่โค้ดโดยตรง (ข้อ 3)
      </p>

      {groups.map((group) => (
        <div key={group} className="bg-white border rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-2 bg-gray-50 text-sm font-medium">{group}</div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t text-left text-gray-600">
                <th className="px-4 py-2 font-medium">สิทธิ์</th>
                {ROLES.map((r) => (
                  <th key={r.key} className="px-4 py-2 font-medium text-center">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.filter((p) => p.group === group).map((p) => (
                <tr key={p.key} className="border-t">
                  <td className="px-4 py-2">{p.label}</td>
                  {ROLES.map((r) => (
                    <td key={r.key} className="px-4 py-2 text-center">
                      {can(r.key, p.key) ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ))}
    </div>
  );
}
