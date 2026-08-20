import { db } from "@/lib/db";
import { createDraftOrder } from "../actions";
import { safeJsonForScript } from "@/lib/safe-json-script";

export default async function NewOrderPage() {
  const customers = await db.customer.findMany({
    where: { active: true },
    include: { branches: { where: { active: true } } },
    orderBy: { companyName: "asc" },
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-xl">
      <a href="/orders" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการออเดอร์
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-4">สร้างออเดอร์ใหม่</h1>

      <form action={createDraftOrder} className="bg-white border rounded-lg p-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า *</label>
          <select
            name="customerId"
            id="customerSelect"
            required
            autoFocus
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            <option value="" disabled selected>
              เลือกลูกค้า
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">สาขา *</label>
          <select name="branchId" id="branchSelect" required className="w-full border rounded px-3 py-1.5 text-sm">
            <option value="" disabled selected>
              — เลือกลูกค้าก่อน —
            </option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ออเดอร์ *</label>
          <input
            name="orderDate"
            type="date"
            defaultValue={today}
            required
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">อ้างอิง</label>
          <input name="reference" className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            สถานที่ส่งสินค้า (ดึงจากที่อยู่สาขาอัตโนมัติ แก้ไขได้)
          </label>
          <input id="placeToDelivery" name="placeToDelivery" className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
          <textarea name="note" rows={2} className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="col-span-2">
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2">
            สร้างออเดอร์ → ไปคีย์รายการสินค้า
          </button>
        </div>
      </form>

      {/* สคริปต์เล็กๆ กรอง Branch ตาม Customer ที่เลือก + auto-fill สถานที่ส่งสินค้าจากที่อยู่สาขา
          เขียนแบบ inline script เพราะเป็นแค่ UX helper ไม่ใช่ business logic (แยกจาก server actions ชัดเจน) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const customersData = ${safeJsonForScript(
              customers.map((c) => ({
                id: c.id,
                branches: c.branches.map((b) => ({ id: b.id, name: b.name, address: b.address ?? "" })),
              }))
            )};
            const customerSelect = document.getElementById('customerSelect');
            const branchSelect = document.getElementById('branchSelect');
            const placeToDeliveryInput = document.getElementById('placeToDelivery');
            function updateBranches() {
              const customer = customersData.find(c => c.id === customerSelect.value);
              branchSelect.innerHTML = '';
              if (!customer || customer.branches.length === 0) {
                branchSelect.innerHTML = '<option value="" disabled selected>ลูกค้ารายนี้ยังไม่มีสาขา</option>';
                return;
              }
              customer.branches.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = b.name;
                branchSelect.appendChild(opt);
              });
              updatePlaceToDelivery();
            }
            function updatePlaceToDelivery() {
              const customer = customersData.find(c => c.id === customerSelect.value);
              const branch = customer && customer.branches.find(b => b.id === branchSelect.value);
              if (branch) placeToDeliveryInput.value = branch.address;
            }
            customerSelect.addEventListener('change', updateBranches);
            branchSelect.addEventListener('change', updatePlaceToDelivery);
          `,
        }}
      />
    </div>
  );
}
