import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";

const TYPES = [
  { href: "/import/customers", label: "ลูกค้า" },
  { href: "/import/branches", label: "สาขา" },
  { href: "/import/products", label: "สินค้า" },
  { href: "/import/prices", label: "ราคา" },
  { href: "/import/discounts", label: "ส่วนลด" },
];

export default async function ImportIndexPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "customer.edit")) redirect("/");

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-1">นำเข้าข้อมูล (Excel Import)</h1>
      <p className="text-sm text-gray-500 mb-4">
        เลือกประเภทข้อมูลที่จะนำเข้า — แนะนำนำเข้าตามลำดับ: ลูกค้า → สาขา → สินค้า → ราคา/ส่วนลด
        (เพราะราคา/สาขาต้องอ้างอิงลูกค้าที่มีอยู่แล้ว)
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TYPES.map((t) => (
          <a key={t.href} href={t.href} className="bg-white border rounded-lg p-4 hover:bg-gray-50">
            <div className="font-medium text-sm">นำเข้า{t.label}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
