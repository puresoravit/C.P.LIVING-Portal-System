import { db } from "@/lib/db";
import { createCustomerPO } from "../actions";
import { CustomerPOForm } from "@/components/production/customer-po-form";

export default async function NewCustomerPOPage() {
  const customers = await db.customer.findMany({
    where: { active: true },
    select: {
      id: true,
      code: true,
      companyName: true,
      branches: { where: { active: true }, select: { id: true, name: true } },
    },
    orderBy: { companyName: "asc" },
  });

  return (
    <div className="max-w-2xl">
      <a href="/production/orders" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการออเดอร์ลูกค้า
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">รับ P.O. ลูกค้า</h1>
      <p className="text-sm text-gray-500 mb-4">
        คีย์รายการที่ลูกค้าสั่ง — ถ้าสินค้ายังไม่มีในระบบ ติ๊ก &quot;พิมพ์ชื่อเอง&quot; ได้ ค่อยผูกกับสินค้าจริงทีหลัง
      </p>
      <CustomerPOForm customers={customers} action={createCustomerPO} />
    </div>
  );
}
