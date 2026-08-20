import { db } from "@/lib/db";
import { createRepairReturnNote } from "../actions";
import { RepairNoteItemEntry } from "@/components/repair-note-item-entry";
import { safeJsonForScript } from "@/lib/safe-json-script";

export default async function NewRepairNotePage() {
  const customers = await db.customer.findMany({
    where: { active: true },
    include: { branches: { where: { active: true } } },
    orderBy: { companyName: "asc" },
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl">
      <a href="/repair-notes" className="text-sm text-blue-600 hover:underline">
        ← กลับไปรายการใบส่งคืนสินค้าฝากซ่อม
      </a>
      <h1 className="text-lg font-semibold mt-2 mb-1">สร้างใบส่งคืนสินค้าฝากซ่อม</h1>
      <p className="text-sm text-gray-500 mb-4">เอกสารนี้ไม่มีราคา — ใช้บันทึกการส่งคืนสินค้าที่ซ่อมเสร็จแล้วให้ลูกค้า</p>

      <div className="bg-white border rounded-lg p-4 grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า *</label>
          <select
            name="customerId"
            form="repairNoteForm"
            id="customerSelect"
            required
            defaultValue=""
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            <option value="" disabled>
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
          <select
            name="branchId"
            form="repairNoteForm"
            id="branchSelect"
            required
            defaultValue=""
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            <option value="" disabled>
              — เลือกลูกค้าก่อน —
            </option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ *</label>
          <input
            name="noteDate"
            form="repairNoteForm"
            type="date"
            defaultValue={today}
            required
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">อ้างอิง</label>
          <input name="reference" form="repairNoteForm" placeholder="เช่น #0629" className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">สถานที่ส่งสินค้า</label>
          <input
            name="placeToDelivery"
            form="repairNoteForm"
            id="placeToDelivery"
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
          <input name="remark" form="repairNoteForm" className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
      </div>

      <RepairNoteItemEntry createAction={createRepairReturnNote} />

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
              updatePlace();
            }
            function updatePlace() {
              const customer = customersData.find(c => c.id === customerSelect.value);
              const branch = customer && customer.branches.find(b => b.id === branchSelect.value);
              if (branch) placeToDeliveryInput.value = branch.address;
            }
            customerSelect.addEventListener('change', updateBranches);
            branchSelect.addEventListener('change', updatePlace);
          `,
        }}
      />
    </div>
  );
}
