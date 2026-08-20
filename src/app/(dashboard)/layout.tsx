import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { can, type Permission } from "@/lib/permissions";

const NAV: { href: string; label: string; perm: Permission | null }[] = [
  { href: "/", label: "แดชบอร์ด", perm: "report.view" },
  { href: "/orders", label: "ออเดอร์ขาย", perm: "order.create" },
  { href: "/invoices", label: "ใบส่งของ/บิล", perm: "invoice.create" },
  { href: "/tax-invoices", label: "ใบกำกับภาษี", perm: "taxInvoice.create" },
  { href: "/billing-notes", label: "ใบวางบิล", perm: "billingNote.create" },
  { href: "/repair-notes", label: "ส่งคืนสินค้าฝากซ่อม", perm: "repairNote.create" },
  { href: "/reports", label: "รายงานยอดขาย", perm: "report.view" },
  { href: "/customers", label: "ลูกค้า", perm: "customer.view" },
  { href: "/branches", label: "สาขา", perm: "branch.view" },
  { href: "/product-types", label: "ประเภทสินค้า", perm: "productType.view" },
  { href: "/products", label: "สินค้า", perm: "product.view" },
  { href: "/prices", label: "ราคา", perm: "price.view" },
  { href: "/discounts", label: "ส่วนลด", perm: "discount.view" },
  { href: "/import", label: "นำเข้าข้อมูล (Excel)", perm: "user.manage" },
  { href: "/audit-log", label: "Audit Log", perm: "auditLog.view" },
  { href: "/settings/vat", label: "ตั้งค่า VAT", perm: "user.manage" },
  { href: "/settings/company", label: "ข้อมูลบริษัท", perm: "user.manage" },
  { href: "/settings/permissions", label: "สิทธิ์การใช้งาน", perm: "user.manage" },
  { href: "/settings/backup", label: "สำรอง/กู้คืนข้อมูล", perm: "user.manage" },
  { href: "/settings/logs", label: "System Logs", perm: "user.manage" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as any).role as string;
  const roleLabel: Record<string, string> = {
    OWNER_ADMIN: "ผู้ดูแลระบบ",
    BILLING_STAFF: "พนักงานออกบิล",
    VIEWER: "ผู้ดูรายงาน",
  };
  const visibleNav = NAV.filter((item) => !item.perm || can(role as any, item.perm));

  return (
    <div className="flex min-h-screen">
      {/* ข้อ 7/10 (Print System): Sidebar ต้องไม่ติดไปกับ Print Preview/เอกสารที่พิมพ์ */}
      <aside className="w-56 bg-white border-r flex flex-col print:hidden">
        <div className="px-4 py-4 border-b">
          <div className="font-semibold">ระบบออกบิล</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {session.user?.name} · {roleLabel[role] ?? role}
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {visibleNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-100"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="px-2 py-3 border-t">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-6 print:p-0">{children}</main>
    </div>
  );
}
